// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {MarketBase} from "./MarketBase.sol";
import {RangeMarket} from "../src/RangeMarket.sol";
import {SafeToken} from "../src/SafeToken.sol";
import {SiliquaOracle} from "../src/SiliquaOracle.sol";
import {MockERC20} from "./MockERC20.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {ISiliquaOracle} from "../src/interfaces/ISiliquaOracle.sol";

contract RangeMarketTest is MarketBase {
    event Settled(int256 twapValue, bool yesWins);
    event Voided(RangeMarket.VoidReason reason);

    // ------------------------------------------------------------------ timeline

    function test_marketClosesTwentyFourHoursBeforeTheTwapWindow() public view {
        assertEq(twapFrom, closeTime + 24 hours);
        assertEq(twapTo, twapFrom + 24 hours);
        assertEq(market.SETTLE_DELAY(), 3 hours);
    }

    function test_buyIsOpenUntilTheCloseSecond() public {
        vm.warp(closeTime - 1);
        _buy(alice, true, 10 * ONE);
        vm.warp(closeTime);
        vm.expectRevert(RangeMarket.Closed.selector);
        _buy(alice, true, 10 * ONE);
    }

    function test_settleOnlyAfterSettleTimePlusThreeHours() public {
        _buy(alice, true, 10 * ONE);
        _buy(bob, false, 10 * ONE);
        _fillWindow(4_000_000, 0);
        vm.warp(uint256(twapTo) + 3 hours - 1);
        vm.expectRevert(RangeMarket.TooEarly.selector);
        market.settle();
        vm.warp(uint256(twapTo) + 3 hours);
        market.settle();
        assertEq(uint8(market.status()), uint8(RangeMarket.Status.Settled));
    }

    function test_settleOnlyOnce() public {
        _buy(alice, true, 10 * ONE);
        _buy(bob, false, 10 * ONE);
        _fillWindow(4_000_000, 0);
        market.settle();
        vm.expectRevert(RangeMarket.NotOpen.selector);
        market.settle();
    }

    // ------------------------------------------------------------------ payouts

    function test_yesWins_winnerTakesLosingPoolMinusTwoPercent() public {
        _buy(alice, true, 600 * ONE);
        _buy(bob, false, 400 * ONE);
        _fillWindow(3_600_000, 0);

        vm.expectEmit(address(market));
        emit Settled(3_600_000, true);
        market.settle();
        assertTrue(market.yesWins());
        assertEq(market.twapValue(), 3_600_000);
        assertEq(market.feeAccrued(), 8 * ONE, "2% of the 400 losing pool");

        vm.prank(alice);
        market.claim();
        assertEq(_balance(alice), 1_000_000 * ONE - 600 * ONE + 992 * ONE);

        vm.prank(bob);
        vm.expectRevert(RangeMarket.NothingToClaim.selector);
        market.claim();
        assertEq(_balance(address(market)), 8 * ONE);
    }

    function test_noWins_whenTheTwapIsBelowTheThreshold() public {
        _buy(alice, true, 100 * ONE);
        _buy(bob, false, 300 * ONE);
        _fillWindow(3_000_000, 0);
        market.settle();
        assertFalse(market.yesWins());
        vm.prank(bob);
        market.claim();
        assertEq(_balance(bob), 1_000_000 * ONE - 300 * ONE + 300 * ONE + 98 * ONE);
    }

    function test_aTwapEqualToTheThresholdIsNo() public {
        _buy(alice, true, 100 * ONE);
        _buy(bob, false, 100 * ONE);
        _fillWindow(THRESHOLD, 0);
        market.settle();
        assertFalse(market.yesWins());
    }

    function test_aTwapOneAboveTheThresholdIsYes() public {
        _buy(alice, true, 100 * ONE);
        _buy(bob, false, 100 * ONE);
        _fillWindow(THRESHOLD + 1, 0);
        market.settle();
        assertTrue(market.yesWins());
    }

    function test_winnersShareInProportionToTheirStake() public {
        _buy(alice, true, 100 * ONE);
        _buy(bob, true, 300 * ONE);
        _buy(carol, false, 400 * ONE);
        _fillWindow(4_000_000, 0);
        market.settle();
        // Pool 800, fee 8, 792 to share 1:3.
        assertEq(market.claimable(alice), 198 * ONE);
        assertEq(market.claimable(bob), 594 * ONE);
        vm.prank(alice);
        market.claim();
        vm.prank(bob);
        market.claim();
        assertEq(_balance(address(market)), 8 * ONE);
    }

    function test_roundingDustGoesToTheFeeRouter() public {
        _buy(alice, true, 1_000_001);
        _buy(bob, true, 2_000_001);
        _buy(carol, false, 1_000_000);
        _fillWindow(4_000_000, 0);
        market.settle();
        uint256 fee = 20_000; // 2% of 1 000 000
        assertEq(market.feeAccrued(), fee);

        vm.prank(alice);
        market.claim();
        // Dust is only known once every winner has claimed.
        assertEq(market.feeAccrued(), fee);
        vm.prank(bob);
        market.claim();

        uint256 dust = market.feeAccrued() - fee;
        assertGt(dust, 0, "this split must leave rounding dust");
        assertLt(dust, 2, "at most one unit per winner");
        assertEq(_balance(address(market)), market.feeAccrued());

        market.sweepFees();
        assertEq(_balance(address(router)), fee + dust);
        assertEq(_balance(address(market)), 0);
    }

    function test_noFeeWhenTheLosingSideIsEmpty() public {
        _buy(alice, true, 100 * ONE);
        _buy(bob, true, 50 * ONE);
        _fillWindow(4_000_000, 0);
        market.settle();
        assertEq(market.feeAccrued(), 0);
        vm.prank(alice);
        market.claim();
        vm.prank(bob);
        market.claim();
        assertEq(_balance(alice), 1_000_000 * ONE);
        assertEq(_balance(bob), 1_000_000 * ONE);
        assertEq(_balance(address(market)), 0);
        vm.expectRevert(RangeMarket.NothingToSweep.selector);
        market.sweepFees();
    }

    function test_theWinningSideEmptyVoidsWithFullRefundAndNoFee() public {
        _buy(alice, false, 100 * ONE);
        _buy(bob, false, 50 * ONE);
        _fillWindow(4_000_000, 0); // YES would win, nobody holds YES
        vm.expectEmit(address(market));
        emit Voided(RangeMarket.VoidReason.EmptyWinningSide);
        market.settle();
        assertEq(uint8(market.status()), uint8(RangeMarket.Status.Void));
        vm.prank(alice);
        market.refundIfVoid();
        vm.prank(bob);
        market.refundIfVoid();
        assertEq(_balance(alice), 1_000_000 * ONE);
        assertEq(_balance(bob), 1_000_000 * ONE);
        assertEq(_balance(address(market)), 0);
        assertEq(market.feeAccrued(), 0);
    }

    function test_aMarketWithNoStakeVoids() public {
        _fillWindow(4_000_000, 0);
        market.settle();
        assertEq(uint8(market.status()), uint8(RangeMarket.Status.Void));
    }

    function test_aTraderOnBothSidesKeepsOnlyTheWinningPayout() public {
        _buy(alice, true, 100 * ONE);
        _buy(alice, false, 100 * ONE);
        _buy(bob, false, 100 * ONE);
        _fillWindow(4_000_000, 0);
        market.settle();
        // Yes pool 100, no pool 200, fee 4, alice takes 296.
        assertEq(market.claimable(alice), 296 * ONE);
        vm.prank(alice);
        market.claim();
        vm.prank(alice);
        vm.expectRevert(RangeMarket.NothingToClaim.selector);
        market.claim();
    }

    // ------------------------------------------------------------------ stale oracle

    function test_sixStaleHoursStillSettle() public {
        _buy(alice, true, 100 * ONE);
        _buy(bob, false, 100 * ONE);
        uint256 sixStale = (1 << 6) - 1;
        _fillWindow(4_000_000, sixStale);
        market.settle();
        assertEq(uint8(market.status()), uint8(RangeMarket.Status.Settled), "6 stale hours is allowed");
    }

    function test_moreThanSixStaleHoursVoidTheMarket() public {
        _buy(alice, true, 100 * ONE);
        _buy(bob, false, 100 * ONE);
        uint256 sevenStale = (1 << 7) - 1;
        _fillWindow(4_000_000, sevenStale);
        vm.expectEmit(address(market));
        emit Voided(RangeMarket.VoidReason.StaleOracle);
        market.settle();
        vm.prank(alice);
        market.refundIfVoid();
        vm.prank(bob);
        market.refundIfVoid();
        assertEq(_balance(alice), 1_000_000 * ONE);
        assertEq(_balance(bob), 1_000_000 * ONE);
    }

    function test_staleHoursAreCumulativeNotContiguous() public {
        _buy(alice, true, 100 * ONE);
        _buy(bob, false, 100 * ONE);
        // Hours 0, 3, 6, 9, 12, 15, 18: seven separate stale hours.
        uint256 mask;
        for (uint256 i; i < 7; ++i) {
            mask |= 1 << (i * 3);
        }
        _fillWindow(4_000_000, mask);
        market.settle();
        assertEq(uint8(market.status()), uint8(RangeMarket.Status.Void));
    }

    function test_aWindowWithNoReportsVoids() public {
        _buy(alice, true, 100 * ONE);
        _buy(bob, false, 100 * ONE);
        vm.warp(uint256(twapTo) + 3 hours);
        market.settle();
        assertEq(uint8(market.status()), uint8(RangeMarket.Status.Void));
    }

    function test_everyHourReportedOnTheLastSecondOfItsLateWindowStillCounts() public {
        _buy(alice, true, 100 * ONE);
        _buy(bob, false, 100 * ONE);
        for (uint256 i; i < 24; ++i) {
            uint64 ts = twapFrom + uint64(i) * 3600;
            vm.warp(uint256(ts) + 3600 + 3 hours);
            submitSlot(GRI_H100, ts, values2(4_000_000, 4_000_000));
        }
        market.settle(); // the clock is at twapTo + 3h, the earliest allowed second
        assertEq(uint8(market.status()), uint8(RangeMarket.Status.Settled));
    }

    // ------------------------------------------------------------------ bet rules

    function test_betCapIsPerAddressAcrossBothSidesAndScaledByDecimals() public {
        assertEq(market.betCap(), 1_000 * ONE);
        _buy(alice, true, 600 * ONE);
        _buy(alice, false, 400 * ONE);
        vm.expectRevert(RangeMarket.CapExceeded.selector);
        _buy(alice, true, 1);
        // Another address has its own cap.
        _buy(bob, true, 1_000 * ONE);
    }

    function test_zeroAmountIsRejected() public {
        vm.expectRevert(RangeMarket.ZeroAmount.selector);
        _buy(alice, true, 0);
    }

    function test_anOracleOperatorCannotBet() public {
        address op = vm.addr(PK1);
        usdg.mint(op, 100 * ONE);
        vm.prank(op);
        usdg.approve(address(market), type(uint256).max);
        vm.expectRevert(RangeMarket.OperatorCannotBet.selector);
        _buy(op, true, 10 * ONE);
    }

    function test_aTokenThatKeepsPartOfATransferIsRejected() public {
        FeeTakingToken taxed = new FeeTakingToken();
        MarketFactory taxedFactory = new MarketFactory(
            IERC20(address(taxed)),
            ISiliquaOracle(address(oracle)),
            address(this),
            guardian,
            MarketFactory.Template(address(router), 200, 1_000, 24 hours, 24 hours, 6 hours)
        );
        taxedFactory.setKeeper(address(this), true);
        RangeMarket m = RangeMarket(taxedFactory.createMarket(GRI_H100, THRESHOLD, closeTime));
        taxed.mint(alice, 100 * ONE);
        vm.prank(alice);
        taxed.approve(address(m), type(uint256).max);
        vm.prank(alice);
        vm.expectRevert(RangeMarket.ReceivedLessThanSent.selector);
        m.buy(true, 100 * ONE);
    }

    // ------------------------------------------------------------------ pause

    function test_pauseStopsBuyButNeverClaimRefundOrSweep() public {
        _buy(alice, true, 100 * ONE);
        _buy(bob, false, 100 * ONE);
        _fillWindow(4_000_000, 0);
        market.settle();

        vm.prank(guardian);
        factory.pause();

        vm.prank(alice);
        market.claim();
        market.sweepFees();
        assertEq(_balance(address(market)), 0);
    }

    function test_pauseDoesNotBlockRefundOnAVoidMarket() public {
        _buy(alice, true, 100 * ONE);
        vm.prank(guardian);
        factory.pause();
        _fillWindow(3_000_000, 0); // NO wins, nobody holds NO
        market.settle(); // the winning NO side is empty: void
        vm.prank(alice);
        market.refundIfVoid();
        assertEq(_balance(alice), 1_000_000 * ONE);
    }

    function test_buyRevertsWhilePausedAndWorksAfterUnpause() public {
        vm.prank(guardian);
        factory.pause();
        vm.expectRevert(RangeMarket.Paused.selector);
        _buy(alice, true, 10 * ONE);
        vm.prank(owner);
        factory.unpause();
        _buy(alice, true, 10 * ONE);
    }

    // ------------------------------------------------------------------ state guards

    function test_claimAndRefundNeedTheRightState() public {
        _buy(alice, true, 100 * ONE);
        _buy(bob, false, 100 * ONE);
        vm.prank(alice);
        vm.expectRevert(RangeMarket.NotSettled.selector);
        market.claim();
        vm.prank(alice);
        vm.expectRevert(RangeMarket.NotVoid.selector);
        market.refundIfVoid();

        _fillWindow(4_000_000, 0);
        market.settle();
        vm.prank(alice);
        vm.expectRevert(RangeMarket.NotVoid.selector);
        market.refundIfVoid();
    }

    function test_aVoidMarketCannotBeClaimed() public {
        _buy(alice, true, 100 * ONE);
        _fillWindow(3_000_000, 0); // NO wins, nobody holds NO
        market.settle();
        vm.prank(alice);
        vm.expectRevert(RangeMarket.NotSettled.selector);
        market.claim();
    }

    function test_refundIsOnlyPaidOnce() public {
        _buy(alice, true, 100 * ONE);
        _fillWindow(3_000_000, 0); // NO wins, nobody holds NO
        market.settle();
        vm.prank(alice);
        market.refundIfVoid();
        vm.prank(alice);
        vm.expectRevert(RangeMarket.NothingToClaim.selector);
        market.refundIfVoid();
    }

    // ------------------------------------------------------------------ expiry: funds can always leave

    function test_ifNobodySettlesTheStakesComeBackAfterFourteenDays() public {
        _buy(alice, true, 100 * ONE);
        _buy(bob, false, 100 * ONE);
        _fillWindow(4_000_000, 0);
        vm.warp(market.expiresAt() - 1);
        vm.prank(alice);
        vm.expectRevert(RangeMarket.NotVoid.selector);
        market.refundIfVoid();

        vm.warp(market.expiresAt());
        vm.expectRevert(RangeMarket.AlreadyExpired.selector);
        market.settle();
        vm.expectEmit(address(market));
        emit Voided(RangeMarket.VoidReason.Expired);
        vm.prank(alice);
        market.refundIfVoid();
        vm.prank(bob);
        market.refundIfVoid();
        assertEq(_balance(address(market)), 0);
    }

    function test_aBrokenOracleCannotLockFunds() public {
        _buy(alice, true, 100 * ONE);
        // The market's oracle is replaced by code that always reverts.
        vm.etch(address(oracle), hex"fd");
        vm.warp(uint256(twapTo) + 3 hours);
        vm.expectRevert();
        market.settle();
        vm.warp(market.expiresAt());
        vm.prank(alice);
        market.refundIfVoid();
        assertEq(_balance(alice), 1_000_000 * ONE);
    }

    // ------------------------------------------------------------------ views

    function test_impliedYesProbabilityFollowsThePools() public {
        assertEq(market.impliedYesBps(), 5_000);
        _buy(alice, true, 300 * ONE);
        _buy(bob, false, 100 * ONE);
        assertEq(market.impliedYesBps(), 7_500);
    }

    function test_feesSweepToTheRouterAndSplitFiftyThirtyTwenty() public {
        _buy(alice, true, 600 * ONE);
        _buy(bob, false, 400 * ONE);
        _fillWindow(4_000_000, 0);
        market.settle();
        market.sweepFees();
        assertEq(_balance(address(router)), 8 * ONE);
        router.distribute(IERC20(address(usdg)));
        assertEq(_balance(buybackWallet), 4 * ONE);
        assertEq(_balance(treasuryWallet), 2_400_000);
        assertEq(_balance(operatorsWallet), 1_600_000);
    }
}

/// Keeps 1% of every transfer, to prove the market checks what it actually received.
contract FeeTakingToken {
    uint8 public constant decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount * 99 / 100;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount * 99 / 100;
        return true;
    }
}
