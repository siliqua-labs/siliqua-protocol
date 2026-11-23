// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {MarketBase} from "./MarketBase.sol";
import {MockERC20} from "./MockERC20.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {RangeMarket, IPauseSource} from "../src/RangeMarket.sol";
import {FeeRouter} from "../src/FeeRouter.sol";
import {OracleRegistry} from "../src/OracleRegistry.sol";
import {SafeToken} from "../src/SafeToken.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {ISiliquaOracle} from "../src/interfaces/ISiliquaOracle.sol";

contract MarketFactoryTest is MarketBase {
    function _template() internal view returns (MarketFactory.Template memory) {
        return MarketFactory.Template(address(router), 200, 1_000, 24 hours, 24 hours, 6 hours);
    }

    function _newFactory(IERC20 token) internal returns (MarketFactory) {
        return new MarketFactory(token, ISiliquaOracle(address(oracle)), owner, guardian, _template());
    }

    // ------------------------------------------------------------------ token decimals

    function test_decimalsAreReadFromTheTokenAndScaleTheCap() public {
        MarketFactory f18 = _newFactory(IERC20(address(new MockERC20(18))));
        assertEq(f18.tokenDecimals(), 18);
        vm.prank(owner);
        f18.setKeeper(keeper, true);
        vm.prank(keeper);
        RangeMarket m = RangeMarket(f18.createMarket(GRI_H100, THRESHOLD, closeTime));
        assertEq(m.betCap(), 1_000 ether);
        assertEq(market.betCap(), 1_000 * ONE);
    }

    function test_rejectsDecimalsOutsideOneToEighteen() public {
        MockERC20 zero = new MockERC20(0);
        vm.expectRevert(abi.encodeWithSelector(MarketFactory.BadDecimals.selector, uint8(0)));
        _newFactory(IERC20(address(zero)));
        MockERC20 big = new MockERC20(19);
        vm.expectRevert(abi.encodeWithSelector(MarketFactory.BadDecimals.selector, uint8(19)));
        _newFactory(IERC20(address(big)));
    }

    function test_rejectsATokenWhoseDecimalsCannotBeRead() public {
        vm.expectRevert(MarketFactory.DecimalsUnreadable.selector);
        _newFactory(IERC20(address(oracle))); // a contract without decimals()
        vm.expectRevert(MarketFactory.DecimalsUnreadable.selector);
        _newFactory(IERC20(makeAddr("eoa")));
    }

    // ------------------------------------------------------------------ creation

    function test_onlyAKeeperCreatesMarkets() public {
        vm.prank(alice);
        vm.expectRevert(MarketFactory.NotKeeper.selector);
        factory.createMarket(GRI_H100, THRESHOLD, closeTime);
        vm.prank(owner);
        vm.expectRevert(MarketFactory.NotKeeper.selector);
        factory.createMarket(GRI_H100, THRESHOLD, closeTime);
    }

    function test_theKeeperRoleCanBeRevoked() public {
        vm.prank(owner);
        factory.setKeeper(keeper, false);
        vm.prank(keeper);
        vm.expectRevert(MarketFactory.NotKeeper.selector);
        factory.createMarket(GRI_H100, THRESHOLD, closeTime);
    }

    function test_marketsAreRegisteredAndPinTheOracleAndTemplate() public view {
        assertEq(factory.marketCount(), 1);
        assertEq(factory.marketAt(0), address(market));
        assertTrue(factory.isMarket(address(market)));
        assertEq(address(market.oracle()), address(oracle));
        assertEq(address(market.token()), address(usdg));
        assertEq(market.feeRouter(), address(router));
        assertEq(market.feeBps(), 200);
        assertEq(market.maxStaleTime(), 6 hours);
        assertEq(market.slotPeriod(), 3600);
        assertEq(market.threshold(), THRESHOLD);
    }

    function test_rejectsAnUnregisteredIndexAZeroThresholdAndAPastClose() public {
        vm.startPrank(keeper);
        vm.expectRevert(MarketFactory.IndexNotRegistered.selector);
        factory.createMarket(keccak256("GRI-NOPE"), THRESHOLD, closeTime);
        vm.expectRevert(MarketFactory.BadThreshold.selector);
        factory.createMarket(GRI_H100, 0, closeTime);
        vm.expectRevert(MarketFactory.BadSchedule.selector);
        factory.createMarket(GRI_H100, THRESHOLD, uint64(block.timestamp));
        vm.stopPrank();
    }

    function test_rejectsAScheduleOffTheSlotGrid() public {
        vm.prank(keeper);
        vm.expectRevert(MarketFactory.BadSchedule.selector);
        factory.createMarket(GRI_H100, THRESHOLD, closeTime + 1);
    }

    function test_rejectsAWindowLongerThanTheTwapReadLimit() public {
        MarketFactory.Template memory t = _template();
        t.twapWindow = 169 hours;
        t.maxStaleTime = 6 hours;
        vm.prank(owner);
        factory.setTemplate(t);
        vm.prank(keeper);
        vm.expectRevert(MarketFactory.BadSchedule.selector);
        factory.createMarket(GRI_H100, THRESHOLD, closeTime);
    }

    // ------------------------------------------------------------------ template

    function test_changingTheTemplateNeverChangesARunningMarket() public {
        MarketFactory.Template memory t = _template();
        t.feeBps = 500;
        t.betCapWholeTokens = 5;
        t.maxStaleTime = 1 hours;
        vm.prank(owner);
        factory.setTemplate(t);

        assertEq(market.feeBps(), 200);
        assertEq(market.betCap(), 1_000 * ONE);
        assertEq(market.maxStaleTime(), 6 hours);

        vm.prank(keeper);
        RangeMarket next = RangeMarket(factory.createMarket(GRI_H100, THRESHOLD, closeTime + 7 days));
        assertEq(next.feeBps(), 500);
        assertEq(next.betCap(), 5 * ONE);
    }

    function test_templateBoundsAndAccess() public {
        MarketFactory.Template memory t = _template();
        vm.prank(alice);
        vm.expectRevert(MarketFactory.NotOwner.selector);
        factory.setTemplate(t);

        vm.startPrank(owner);
        t.feeBps = 1_001;
        vm.expectRevert(MarketFactory.BadTemplate.selector);
        factory.setTemplate(t);
        t = _template();
        t.betCapWholeTokens = 0;
        vm.expectRevert(MarketFactory.BadTemplate.selector);
        factory.setTemplate(t);
        t = _template();
        t.maxStaleTime = 25 hours;
        vm.expectRevert(MarketFactory.BadTemplate.selector);
        factory.setTemplate(t);
        t = _template();
        t.feeRouter = address(0);
        vm.expectRevert(MarketFactory.ZeroAddress.selector);
        factory.setTemplate(t);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ pause and roles

    function test_pauseByGuardianOrOwnerUnpauseByOwnerOnly() public {
        vm.prank(alice);
        vm.expectRevert(MarketFactory.NotOwnerOrGuardian.selector);
        factory.pause();

        vm.prank(guardian);
        factory.pause();
        assertTrue(factory.paused());

        vm.prank(guardian);
        vm.expectRevert(MarketFactory.NotOwner.selector);
        factory.unpause();

        vm.prank(owner);
        factory.unpause();
        assertFalse(factory.paused());
        vm.prank(owner);
        factory.pause();
        assertTrue(factory.paused());
    }

    function test_ownershipAndGuardianHandover() public {
        address next = makeAddr("next");
        vm.prank(owner);
        factory.transferOwnership(next);
        vm.prank(owner);
        vm.expectRevert(MarketFactory.NotOwner.selector);
        factory.setKeeper(alice, true);
        vm.prank(next);
        factory.setGuardian(alice);
        assertEq(factory.guardian(), alice);
        vm.prank(next);
        vm.expectRevert(MarketFactory.ZeroAddress.selector);
        factory.transferOwnership(address(0));
    }

    function test_constructorRejectsZeroAddresses() public {
        vm.expectRevert(MarketFactory.ZeroAddress.selector);
        new MarketFactory(IERC20(address(0)), ISiliquaOracle(address(oracle)), owner, guardian, _template());
        vm.expectRevert(MarketFactory.ZeroAddress.selector);
        new MarketFactory(IERC20(address(usdg)), ISiliquaOracle(address(0)), owner, guardian, _template());
        vm.expectRevert(MarketFactory.ZeroAddress.selector);
        new MarketFactory(IERC20(address(usdg)), ISiliquaOracle(address(oracle)), address(0), guardian, _template());
    }
}

contract FeeRouterTest is MarketBase {
    function test_splitsFiftyThirtyTwenty() public {
        usdg.mint(address(router), 1_000 * ONE);
        router.distribute(IERC20(address(usdg)));
        assertEq(_balance(buybackWallet), 500 * ONE);
        assertEq(_balance(treasuryWallet), 300 * ONE);
        assertEq(_balance(operatorsWallet), 200 * ONE);
        assertEq(_balance(address(router)), 0);
    }

    function test_dustGoesToTheOperatorsShareSoNothingStaysBehind() public {
        usdg.mint(address(router), 7);
        router.distribute(IERC20(address(usdg)));
        assertEq(_balance(buybackWallet), 3);
        assertEq(_balance(treasuryWallet), 2);
        assertEq(_balance(operatorsWallet), 2);
        assertEq(_balance(address(router)), 0);
    }

    function test_anyoneCanDistributeAndAnEmptyRouterReverts() public {
        vm.expectRevert(FeeRouter.NothingToDistribute.selector);
        router.distribute(IERC20(address(usdg)));
        usdg.mint(address(router), 10);
        vm.prank(alice);
        router.distribute(IERC20(address(usdg)));
    }

    function test_recipientsAreFixedAndNonZero() public {
        assertEq(router.buyback(), buybackWallet);
        assertEq(router.treasury(), treasuryWallet);
        assertEq(router.operators(), operatorsWallet);
        vm.expectRevert(FeeRouter.ZeroAddress.selector);
        new FeeRouter(address(0), treasuryWallet, operatorsWallet);
        vm.expectRevert(FeeRouter.ZeroAddress.selector);
        new FeeRouter(buybackWallet, address(0), operatorsWallet);
        vm.expectRevert(FeeRouter.ZeroAddress.selector);
        new FeeRouter(buybackWallet, treasuryWallet, address(0));
    }

    function testFuzz_theSplitAlwaysAddsUpAndFollowsTheShares(uint96 amount) public {
        uint256 a = bound(amount, 1, type(uint96).max);
        usdg.mint(address(router), a);
        router.distribute(IERC20(address(usdg)));
        assertEq(_balance(buybackWallet) + _balance(treasuryWallet) + _balance(operatorsWallet), a);
        assertEq(_balance(buybackWallet), a * 5_000 / 10_000);
        assertEq(_balance(treasuryWallet), a * 3_000 / 10_000);
        assertEq(_balance(address(router)), 0);
    }
}

contract OracleRegistryTest is MarketBase {
    OracleRegistry internal registry;

    function setUp() public override {
        super.setUp();
        registry = new OracleRegistry(admin);
    }

    function test_listsVersionsInOrderAndNeverRemovesOne() public {
        vm.startPrank(admin);
        assertEq(registry.register(registry.ORACLE(), address(oracle)), 1);
        SiliquaOracleLike second = new SiliquaOracleLike();
        assertEq(registry.register(registry.ORACLE(), address(second)), 2);
        vm.stopPrank();
        assertEq(registry.current(registry.ORACLE()), address(second));
        assertEq(registry.at(registry.ORACLE(), 1), address(oracle));
        assertEq(registry.count(registry.ORACLE()), 2);
        assertEq(registry.count(registry.FACTORY()), 0);
    }

    function test_onlyTheAdminRegistersAndOnlyContracts() public {
        bytes32 kind = registry.FACTORY();
        vm.prank(alice);
        vm.expectRevert(OracleRegistry.NotAdmin.selector);
        registry.register(kind, address(factory));
        vm.prank(admin);
        vm.expectRevert(OracleRegistry.NotAContract.selector);
        registry.register(kind, alice);
        vm.expectRevert(OracleRegistry.NoDeployment.selector);
        registry.current(kind);
    }

    function test_adminHandover() public {
        vm.prank(admin);
        registry.transferAdmin(alice);
        vm.prank(admin);
        vm.expectRevert(OracleRegistry.NotAdmin.selector);
        registry.transferAdmin(admin);
        vm.prank(alice);
        vm.expectRevert(OracleRegistry.ZeroAddress.selector);
        registry.transferAdmin(address(0));
    }
}

contract SiliquaOracleLike {}

contract SafeTokenTest is MarketBase {
    function test_aFalseReturnIsAFailure() public {
        FalseToken t = new FalseToken();
        vm.expectRevert(SafeToken.TransferFailed.selector);
        this.callTransfer(IERC20(address(t)));
    }

    function test_aTokenWithNoReturnValueIsAccepted() public {
        SilentToken t = new SilentToken();
        this.callTransfer(IERC20(address(t)));
    }

    function callTransfer(IERC20 token) external {
        SafeToken.safeTransfer(token, alice, 1);
    }
}

contract FalseToken {
    function transfer(address, uint256) external pure returns (bool) {
        return false;
    }
}

contract SilentToken {
    function transfer(address, uint256) external pure {}
}
