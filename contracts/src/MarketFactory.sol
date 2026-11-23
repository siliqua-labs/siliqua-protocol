// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "./interfaces/IERC20.sol";
import {ISiliquaOracle} from "./interfaces/ISiliquaOracle.sol";
import {RangeMarket, IPauseSource} from "./RangeMarket.sol";

/// Creates weekly markets from a template. Fee, bet cap and durations are template parameters,
/// copied into each market at creation: changing the template never touches a running market.
/// The factory is pinned to one oracle and one token; a new oracle means a new factory.
contract MarketFactory is IPauseSource {
    struct Template {
        address feeRouter;
        uint16 feeBps;
        // Whole tokens; scaled by the token's decimals() at market creation.
        uint32 betCapWholeTokens;
        // Market closes this long before the TWAP window starts.
        uint32 closeBeforeTwap;
        uint32 twapWindow;
        // Void when cumulative stale time inside the window exceeds this.
        uint32 maxStaleTime;
    }

    // Sanity bound on the fee template, not a policy: the product decision is 2%.
    uint16 public constant MAX_FEE_BPS = 1_000;
    uint32 public constant MAX_TWAP_SLOTS = 168;

    IERC20 public immutable token;
    uint8 public immutable tokenDecimals;
    ISiliquaOracle public immutable oracle;

    address public owner;
    address public guardian;
    bool public paused;
    Template public template;
    mapping(address => bool) public isKeeper;
    mapping(address => bool) public isMarket;
    address[] private _markets;

    event MarketCreated(
        address indexed market,
        bytes32 indexed indexId,
        uint256 threshold,
        uint64 closeTime,
        uint64 twapFrom,
        uint64 twapTo,
        uint16 feeBps,
        uint256 betCap
    );
    event TemplateChanged(Template template);
    event KeeperChanged(address indexed keeper, bool allowed);
    event PausedChanged(bool paused);
    event OwnerChanged(address owner);
    event GuardianChanged(address guardian);

    error NotOwner();
    error NotOwnerOrGuardian();
    error NotKeeper();
    error ZeroAddress();
    error DecimalsUnreadable();
    error BadDecimals(uint8 decimals);
    error BadTemplate();
    error IndexNotRegistered();
    error BadSchedule();
    error BadThreshold();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(IERC20 token_, ISiliquaOracle oracle_, address owner_, address guardian_, Template memory template_) {
        if (address(token_) == address(0) || address(oracle_) == address(0)) revert ZeroAddress();
        if (owner_ == address(0) || guardian_ == address(0)) revert ZeroAddress();

        // The decimals are read from the token and validated; nothing is assumed about USDG.
        uint8 d;
        try token_.decimals() returns (uint8 value) {
            d = value;
        } catch {
            revert DecimalsUnreadable();
        }
        if (d == 0 || d > 18) revert BadDecimals(d);

        token = token_;
        tokenDecimals = d;
        oracle = oracle_;
        owner = owner_;
        guardian = guardian_;
        _setTemplate(template_);
    }

    // ------------------------------------------------------------------ administration

    function setTemplate(Template calldata template_) external onlyOwner {
        _setTemplate(template_);
    }

    function _setTemplate(Template memory t) private {
        if (t.feeRouter == address(0)) revert ZeroAddress();
        if (t.feeBps > MAX_FEE_BPS || t.betCapWholeTokens == 0) revert BadTemplate();
        if (t.twapWindow == 0 || t.maxStaleTime > t.twapWindow) revert BadTemplate();
        template = t;
        emit TemplateChanged(t);
    }

    function setKeeper(address keeper, bool allowed) external onlyOwner {
        isKeeper[keeper] = allowed;
        emit KeeperChanged(keeper, allowed);
    }

    /// Stops `buy` on every market of this factory and nothing else.
    function pause() external {
        if (msg.sender != owner && msg.sender != guardian) revert NotOwnerOrGuardian();
        paused = true;
        emit PausedChanged(true);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit PausedChanged(false);
    }

    function setGuardian(address guardian_) external onlyOwner {
        if (guardian_ == address(0)) revert ZeroAddress();
        guardian = guardian_;
        emit GuardianChanged(guardian_);
    }

    function transferOwnership(address owner_) external onlyOwner {
        if (owner_ == address(0)) revert ZeroAddress();
        owner = owner_;
        emit OwnerChanged(owner_);
    }

    // ------------------------------------------------------------------ markets

    /// The TWAP window starts `closeBeforeTwap` after `closeTime` and lasts `twapWindow`. Both ends
    /// must sit on slot boundaries of the index so every slot of the window is a whole slot.
    function createMarket(bytes32 indexId, uint256 threshold, uint64 closeTime)
        external
        returns (address marketAddress)
    {
        if (!isKeeper[msg.sender]) revert NotKeeper();
        ISiliquaOracle.IndexConfig memory cfg = oracle.indexConfig(indexId);
        if (!cfg.registered) revert IndexNotRegistered();
        if (threshold == 0) revert BadThreshold();

        Template memory t = template;
        uint64 twapFrom = closeTime + t.closeBeforeTwap;
        uint64 twapTo = twapFrom + t.twapWindow;
        if (closeTime <= block.timestamp) revert BadSchedule();
        if (twapFrom % cfg.period != 0 || twapTo % cfg.period != 0) revert BadSchedule();
        if (t.twapWindow / cfg.period > MAX_TWAP_SLOTS) revert BadSchedule();

        uint256 betCap = uint256(t.betCapWholeTokens) * 10 ** tokenDecimals;
        RangeMarket market = new RangeMarket(
            RangeMarket.Params({
                oracle: oracle,
                token: token,
                feeRouter: t.feeRouter,
                pauseSource: IPauseSource(address(this)),
                indexId: indexId,
                threshold: threshold,
                closeTime: closeTime,
                twapFrom: twapFrom,
                twapTo: twapTo,
                slotPeriod: cfg.period,
                maxStaleTime: t.maxStaleTime,
                feeBps: t.feeBps,
                betCap: betCap
            })
        );
        marketAddress = address(market);
        isMarket[marketAddress] = true;
        _markets.push(marketAddress);
        emit MarketCreated(marketAddress, indexId, threshold, closeTime, twapFrom, twapTo, t.feeBps, betCap);
    }

    function marketCount() external view returns (uint256) {
        return _markets.length;
    }

    function marketAt(uint256 i) external view returns (address) {
        return _markets[i];
    }
}
