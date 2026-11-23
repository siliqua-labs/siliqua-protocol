// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {OracleBase} from "./Base.sol";
import {MockERC20} from "./MockERC20.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {RangeMarket} from "../src/RangeMarket.sol";
import {FeeRouter} from "../src/FeeRouter.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {ISiliquaOracle} from "../src/interfaces/ISiliquaOracle.sol";

/// Oracle, 6-decimals token, fee router, factory and one market with a 3 500 000 threshold
/// (3.50 USD per GPU-hour).
abstract contract MarketBase is OracleBase {
    uint256 internal constant THRESHOLD = 3_500_000;
    uint256 internal constant ONE = 1e6;

    address internal owner = makeAddr("owner");
    address internal keeper = makeAddr("keeper");
    address internal buybackWallet = makeAddr("buyback");
    address internal treasuryWallet = makeAddr("treasury");
    address internal operatorsWallet = makeAddr("operators");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    MockERC20 internal usdg;
    FeeRouter internal router;
    MarketFactory internal factory;
    RangeMarket internal market;

    uint64 internal closeTime;
    uint64 internal twapFrom;
    uint64 internal twapTo;

    function setUp() public virtual override {
        super.setUp();
        usdg = new MockERC20(6);
        router = new FeeRouter(buybackWallet, treasuryWallet, operatorsWallet);
        factory = new MarketFactory(
            IERC20(address(usdg)),
            ISiliquaOracle(address(oracle)),
            owner,
            guardian,
            MarketFactory.Template({
                feeRouter: address(router),
                feeBps: 200,
                betCapWholeTokens: 1_000,
                closeBeforeTwap: 24 hours,
                twapWindow: 24 hours,
                maxStaleTime: 6 hours
            })
        );
        vm.prank(owner);
        factory.setKeeper(keeper, true);

        closeTime = uint64(block.timestamp) + 3 days;
        market = _create(THRESHOLD, closeTime);
        twapFrom = market.twapFrom();
        twapTo = market.twapTo();

        address[3] memory users = [alice, bob, carol];
        for (uint256 i; i < users.length; ++i) {
            usdg.mint(users[i], 1_000_000 * ONE);
            vm.prank(users[i]);
            usdg.approve(address(market), type(uint256).max);
        }
    }

    function _create(uint256 threshold, uint64 close) internal returns (RangeMarket) {
        vm.prank(keeper);
        return RangeMarket(factory.createMarket(GRI_H100, threshold, close));
    }

    function _buy(address who, bool yes, uint256 amount) internal {
        vm.prank(who);
        market.buy(yes, amount);
    }

    /// Reports every hour of the TWAP window with `value`, except the hours whose bit is set in
    /// `staleMask` (bit 0 is the first hour). Leaves the clock at the end of the late window.
    function _fillWindow(uint256 value, uint256 staleMask) internal {
        for (uint256 i; i < 24; ++i) {
            if (staleMask & (1 << i) != 0) continue;
            uint64 ts = twapFrom + uint64(i) * 3600;
            vm.warp(uint256(ts) + 3600);
            submitSlot(GRI_H100, ts, values2(value, value));
        }
        vm.warp(uint256(twapTo) + 3 hours);
    }

    function _balance(address who) internal view returns (uint256) {
        return usdg.balanceOf(who);
    }
}
