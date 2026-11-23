// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {MarketBase} from "./MarketBase.sol";
import {RangeMarket} from "../src/RangeMarket.sol";

/// Random sequences of buy, oracle reports, settle, claim, refund, sweep and pause against one
/// market. This contract is its own handler. The properties of docs/PLAN.md 3.2: claims plus
/// refunds never exceed the balance, funds can always leave, and pause never blocks an exit.
contract MarketInvariantTest is StdInvariant, MarketBase {
    address[3] internal actors;

    uint256 internal deposited;
    uint256 internal paidToUsers;
    uint256 internal sweptToRouter;
    bool internal exitWasBlockedByPause;
    bool internal oracleFilled;

    function setUp() public override {
        super.setUp();
        actors = [alice, bob, carol];

        bytes4[] memory selectors = new bytes4[](8);
        selectors[0] = this.handlerBuy.selector;
        selectors[1] = this.handlerFillOracle.selector;
        selectors[2] = this.handlerSettle.selector;
        selectors[3] = this.handlerClaim.selector;
        selectors[4] = this.handlerRefund.selector;
        selectors[5] = this.handlerSweep.selector;
        selectors[6] = this.handlerTogglePause.selector;
        selectors[7] = this.handlerWarpToExpiry.selector;
        targetSelector(FuzzSelector({addr: address(this), selectors: selectors}));
        targetContract(address(this));
    }

    function handlerBuy(uint256 actorSeed, bool yes, uint256 amount) external {
        address who = actors[actorSeed % 3];
        amount = bound(amount, 1, 600 * ONE);
        uint256 before = _balance(address(market));
        vm.prank(who);
        try market.buy(yes, amount) {
            deposited += _balance(address(market)) - before;
        } catch {}
    }

    /// Fills the 24 hours of the window once. `seed` picks the level and which hours are missing.
    function handlerFillOracle(uint256 seed) external {
        if (oracleFilled) return;
        oracleFilled = true;
        uint256 value = seed % 2 == 0 ? THRESHOLD + 1 + (seed >> 8) % 1_000_000 : (seed >> 8) % THRESHOLD + 1;
        uint256 staleMask = (seed >> 40) & ((1 << 24) - 1);
        if (seed % 3 == 0) staleMask = 0;
        _fillWindow(value, staleMask);
    }

    function handlerSettle() external {
        if (block.timestamp < uint256(twapTo) + 3 hours) vm.warp(uint256(twapTo) + 3 hours);
        try market.settle() {} catch {}
    }

    function handlerClaim(uint256 actorSeed) external {
        _exit(actors[actorSeed % 3], true);
    }

    function handlerRefund(uint256 actorSeed) external {
        _exit(actors[actorSeed % 3], false);
    }

    function _exit(address who, bool isClaim) internal {
        uint256 before = _balance(who);
        vm.prank(who);
        bytes memory callData =
            isClaim ? abi.encodeCall(RangeMarket.claim, ()) : abi.encodeCall(RangeMarket.refundIfVoid, ());
        (bool ok, bytes memory ret) = address(market).call(callData);
        if (ok) {
            paidToUsers += _balance(who) - before;
        } else if (ret.length >= 4 && bytes4(ret) == RangeMarket.Paused.selector) {
            exitWasBlockedByPause = true;
        }
    }

    function handlerSweep() external {
        uint256 before = _balance(address(router));
        try market.sweepFees() {
            sweptToRouter += _balance(address(router)) - before;
        } catch {}
    }

    function handlerTogglePause() external {
        if (factory.paused()) {
            vm.prank(owner);
            factory.unpause();
        } else {
            vm.prank(guardian);
            factory.pause();
        }
    }

    function handlerWarpToExpiry() external {
        if (block.timestamp < market.expiresAt()) vm.warp(market.expiresAt());
    }

    // ------------------------------------------------------------------ invariants

    /// Every token that came in is either still in the market or went out through a claim, a
    /// refund or a sweep. Nothing is created, nothing is lost.
    function invariant_tokensAreConserved() public view {
        assertEq(_balance(address(market)), deposited - paidToUsers - sweptToRouter);
    }

    function invariant_claimsAndRefundsNeverExceedWhatWasDeposited() public view {
        assertLe(paidToUsers + sweptToRouter, deposited);
    }

    function invariant_pauseNeverBlocksAnExit() public view {
        assertFalse(exitWasBlockedByPause);
    }

    /// After settle, what is left in the market is exactly the unclaimed payouts plus unswept fees.
    function invariant_settledBalanceMatchesLiabilities() public view {
        if (market.status() != RangeMarket.Status.Settled) return;
        uint256 unclaimed = market.payoutPool() - market.paidOut();
        uint256 unsweptFees = market.feeAccrued() - market.feeSwept();
        if (market.claimedStake() == market.winningPool()) {
            // Everyone has claimed: the leftover is all fee, dust included.
            assertEq(_balance(address(market)), unsweptFees);
        } else {
            assertEq(_balance(address(market)), unclaimed + unsweptFees);
        }
    }

    /// While open nothing has left the market.
    function invariant_openMarketHoldsEveryStake() public view {
        if (market.status() != RangeMarket.Status.Open) return;
        assertEq(_balance(address(market)), market.yesPool() + market.noPool());
        assertEq(paidToUsers + sweptToRouter, 0);
    }

    function invariant_noWinnerIsPaidMoreThanThePool() public view {
        if (market.status() != RangeMarket.Status.Settled) return;
        assertLe(market.paidOut(), market.payoutPool());
        assertLe(market.claimedStake(), market.winningPool());
    }

    /// A void market owes each trader exactly their stake: the balance never goes below it.
    function invariant_voidMarketCanRefundEveryone() public view {
        if (market.status() != RangeMarket.Status.Void) return;
        uint256 owed;
        for (uint256 i; i < 3; ++i) {
            owed += market.yesStake(actors[i]) + market.noStake(actors[i]);
        }
        assertEq(_balance(address(market)), owed);
    }
}
