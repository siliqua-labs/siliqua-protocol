// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "./interfaces/IERC20.sol";
import {ISiliquaOracle} from "./interfaces/ISiliquaOracle.sol";
import {SafeToken} from "./SafeToken.sol";

interface IPauseSource {
    function paused() external view returns (bool);
}

/// One weekly parimutuel market: "is the TWAP of `indexId` over [twapFrom, twapTo) above
/// `threshold`?" in USDG. Immutable and pinned to one oracle. No function lets anyone rescue or
/// alter a running market; that is deliberate (docs/PLAN.md D6). `pause` on the factory stops
/// `buy` only: `claim`, `refundIfVoid` and `sweepFees` never read it.
contract RangeMarket {
    using SafeToken for IERC20;

    enum Status {
        Open,
        Settled,
        Void
    }

    enum VoidReason {
        StaleOracle,
        EmptyWinningSide,
        Expired
    }

    struct Params {
        ISiliquaOracle oracle;
        IERC20 token;
        address feeRouter;
        IPauseSource pauseSource;
        bytes32 indexId;
        uint256 threshold;
        uint64 closeTime;
        uint64 twapFrom;
        uint64 twapTo;
        uint32 slotPeriod;
        uint32 maxStaleTime;
        uint16 feeBps;
        uint256 betCap;
    }

    uint64 public constant SETTLE_DELAY = 3 hours;
    // If settle was not possible for this long, funds must still be able to leave.
    uint64 public constant EXPIRY = 14 days;
    uint256 private constant BPS = 10_000;

    ISiliquaOracle public immutable oracle;
    IERC20 public immutable token;
    address public immutable feeRouter;
    IPauseSource public immutable pauseSource;
    bytes32 public immutable indexId;
    uint256 public immutable threshold;
    uint64 public immutable closeTime;
    uint64 public immutable twapFrom;
    uint64 public immutable twapTo;
    uint32 public immutable slotPeriod;
    uint32 public immutable maxStaleTime;
    uint16 public immutable feeBps;
    uint256 public immutable betCap;

    Status public status;
    bool public yesWins;
    uint256 public twapValue;
    uint256 public yesPool;
    uint256 public noPool;
    mapping(address => uint256) public yesStake;
    mapping(address => uint256) public noStake;

    // Settlement accounting, set once by settle().
    uint256 public payoutPool; // winning pool plus losing pool minus fee
    uint256 public winningPool;
    uint256 public claimedStake;
    uint256 public paidOut;
    uint256 public feeAccrued; // fee plus rounding dust, swept to the router by anyone
    uint256 public feeSwept;

    event Bought(address indexed account, bool yes, uint256 amount);
    event Settled(int256 twapValue, bool yesWins);
    event Voided(VoidReason reason);
    event Claimed(address indexed account, uint256 amount);
    event Refunded(address indexed account, uint256 amount);
    event FeesSwept(uint256 amount);

    error Paused();
    error Closed();
    error ZeroAmount();
    error OperatorCannotBet();
    error CapExceeded();
    error ReceivedLessThanSent();
    error NotOpen();
    error TooEarly();
    error AlreadyExpired();
    error NotSettled();
    error NotVoid();
    error NothingToClaim();
    error NothingToSweep();
    error TwapTooLarge();

    constructor(Params memory p) {
        oracle = p.oracle;
        token = p.token;
        feeRouter = p.feeRouter;
        pauseSource = p.pauseSource;
        indexId = p.indexId;
        threshold = p.threshold;
        closeTime = p.closeTime;
        twapFrom = p.twapFrom;
        twapTo = p.twapTo;
        slotPeriod = p.slotPeriod;
        maxStaleTime = p.maxStaleTime;
        feeBps = p.feeBps;
        betCap = p.betCap;
    }

    // ------------------------------------------------------------------ before close

    function buy(bool yes, uint256 amount) external {
        if (pauseSource.paused()) revert Paused();
        if (block.timestamp >= closeTime) revert Closed();
        if (amount == 0) revert ZeroAmount();
        if (oracle.isOperator(msg.sender)) revert OperatorCannotBet();
        if (yesStake[msg.sender] + noStake[msg.sender] + amount > betCap) revert CapExceeded();

        if (yes) {
            yesStake[msg.sender] += amount;
            yesPool += amount;
        } else {
            noStake[msg.sender] += amount;
            noPool += amount;
        }

        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        if (token.balanceOf(address(this)) - before != amount) revert ReceivedLessThanSent();
        emit Bought(msg.sender, yes, amount);
    }

    // ------------------------------------------------------------------ settlement

    function expiresAt() public view returns (uint256) {
        return uint256(twapTo) + SETTLE_DELAY + EXPIRY;
    }

    /// Anyone, once every slot of the window has passed its late-report window.
    function settle() external {
        if (status != Status.Open) revert NotOpen();
        if (block.timestamp < uint256(twapTo) + SETTLE_DELAY) revert TooEarly();
        if (block.timestamp >= expiresAt()) revert AlreadyExpired();

        (uint256 value, uint32 usedSlots, uint32 staleSlots) = oracle.twap(indexId, twapFrom, twapTo);
        if (value > uint256(type(int256).max)) revert TwapTooLarge();
        if (usedSlots == 0 || uint256(staleSlots) * slotPeriod > maxStaleTime) return _void(VoidReason.StaleOracle);

        // Equal is NO.
        bool yes = value > threshold;
        uint256 winners = yes ? yesPool : noPool;
        uint256 losers = yes ? noPool : yesPool;
        if (winners == 0) return _void(VoidReason.EmptyWinningSide);

        status = Status.Settled;
        yesWins = yes;
        twapValue = value;
        winningPool = winners;
        // No losing stake means no fee: winners just get their stake back.
        uint256 fee = losers == 0 ? 0 : losers * feeBps / BPS;
        feeAccrued = fee;
        payoutPool = winners + losers - fee;
        emit Settled(int256(value), yes);
    }

    function _void(VoidReason reason) private {
        status = Status.Void;
        emit Voided(reason);
    }

    // ------------------------------------------------------------------ after settlement

    function claim() external {
        if (status != Status.Settled) revert NotSettled();
        uint256 stake = yesWins ? yesStake[msg.sender] : noStake[msg.sender];
        if (stake == 0) revert NothingToClaim();
        if (yesWins) yesStake[msg.sender] = 0;
        else noStake[msg.sender] = 0;

        uint256 payout = stake * payoutPool / winningPool;
        paidOut += payout;
        claimedStake += stake;
        // Once every winner has claimed, what rounding left behind is fee dust for the router.
        // forge-lint: disable-next-line(incorrect-strict-equality)
        if (claimedStake == winningPool) feeAccrued += payoutPool - paidOut;

        emit Claimed(msg.sender, payout);
        token.safeTransfer(msg.sender, payout);
    }

    function refundIfVoid() external {
        if (status == Status.Open && block.timestamp >= expiresAt()) _void(VoidReason.Expired);
        if (status != Status.Void) revert NotVoid();
        uint256 amount = yesStake[msg.sender] + noStake[msg.sender];
        if (amount == 0) revert NothingToClaim();
        yesStake[msg.sender] = 0;
        noStake[msg.sender] = 0;

        emit Refunded(msg.sender, amount);
        token.safeTransfer(msg.sender, amount);
    }

    /// Anyone. Fees accrue here at settle and leave in a separate call so a failing recipient can
    /// never block settle, claim or refund.
    function sweepFees() external {
        uint256 amount = feeAccrued - feeSwept;
        if (amount == 0) revert NothingToSweep();
        feeSwept = feeAccrued;
        emit FeesSwept(amount);
        token.safeTransfer(feeRouter, amount);
    }

    // ------------------------------------------------------------------ views

    /// Implied probability of YES in basis points from the pools, 5000 when both are empty.
    function impliedYesBps() external view returns (uint256) {
        uint256 total = yesPool + noPool;
        return total == 0 ? 5_000 : yesPool * BPS / total;
    }

    function claimable(address account) external view returns (uint256) {
        if (status == Status.Void) return yesStake[account] + noStake[account];
        if (status != Status.Settled) return 0;
        uint256 stake = yesWins ? yesStake[account] : noStake[account];
        return stake * payoutPool / winningPool;
    }
}
