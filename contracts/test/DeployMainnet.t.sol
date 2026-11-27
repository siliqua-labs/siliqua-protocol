// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {DeployMainnet} from "../script/DeployMainnet.s.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {MockERC20} from "./MockERC20.sol";

contract MockSafe {
    uint256 public getThreshold;
    address[] private _owners;

    constructor(uint256 threshold, uint256 ownerCount) {
        getThreshold = threshold;
        for (uint256 i; i < ownerCount; ++i) {
            _owners.push(address(uint160(i + 1)));
        }
    }

    function getOwners() external view returns (address[] memory) {
        return _owners;
    }
}

contract MockTimelock {
    uint256 public getMinDelay;
    mapping(bytes32 => mapping(address => bool)) public hasRole;

    constructor(uint256 delay) {
        getMinDelay = delay;
    }

    function grant(bytes32 role, address account) external {
        hasRole[role][account] = true;
    }
}

contract DeployMainnetTest is Test {
    bytes32 private constant PROPOSER_ROLE = keccak256("PROPOSER_ROLE");
    bytes32 private constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");

    DeployMainnet private script;
    MockSafe private safe;
    MockTimelock private timelock;
    DeployMainnet.Config private config;

    function setUp() public {
        vm.chainId(4663);
        script = new DeployMainnet();
        safe = new MockSafe(2, 3);
        timelock = new MockTimelock(2 days);
        timelock.grant(PROPOSER_ROLE, address(safe));
        timelock.grant(EXECUTOR_ROLE, address(safe));
        config = DeployMainnet.Config({
            token: IERC20(address(new MockERC20(6))),
            safe: address(safe),
            timelock: address(timelock),
            operators: [makeAddr("op1"), makeAddr("op2"), makeAddr("op3")],
            keeper: makeAddr("keeper"),
            feeBuyback: makeAddr("buyback"),
            feeTreasury: makeAddr("treasury"),
            feeOperators: makeAddr("operatorsShare"),
            betCapWholeTokens: 50
        });
    }

    function test_handsEveryRoleToTimelockAndSafe() public {
        DeployMainnet.Deployment memory d = script.deploy(config);

        assertEq(d.oracle.admin(), address(timelock));
        assertEq(d.oracle.guardian(), address(safe));
        assertEq(d.factory.owner(), address(timelock));
        assertEq(d.factory.guardian(), address(safe));
        assertEq(d.registry.admin(), address(timelock));
        assertEq(d.registry.current(d.registry.ORACLE()), address(d.oracle));
        assertEq(d.registry.current(d.registry.FACTORY()), address(d.factory));
    }

    function test_configuresOperatorsIndexesKeeperAndTemplate() public {
        DeployMainnet.Deployment memory d = script.deploy(config);

        assertEq(d.oracle.operatorCount(), 3);
        for (uint256 i; i < 3; ++i) {
            assertTrue(d.oracle.isOperator(config.operators[i]));
        }
        string[5] memory classes = ["GRI-4090", "GRI-A100", "GRI-B200", "GRI-H100", "GRI-H200"];
        for (uint256 i; i < classes.length; ++i) {
            assertTrue(d.oracle.indexConfig(keccak256(bytes(classes[i]))).registered);
        }
        assertTrue(d.factory.isKeeper(config.keeper));
        assertEq(d.router.buyback(), config.feeBuyback);
        assertEq(d.router.treasury(), config.feeTreasury);
        assertEq(d.router.operators(), config.feeOperators);
        (address feeRouter, uint16 feeBps, uint32 betCap,,,) = d.factory.template();
        assertEq(feeRouter, address(d.router));
        assertEq(feeBps, 200);
        assertEq(betCap, 50);
    }

    function test_rejectsAnotherChain() public {
        vm.chainId(46630);
        vm.expectRevert("not Robinhood Chain mainnet");
        script.deploy(config);
    }

    function test_rejectsTokenWithoutCode() public {
        config.token = IERC20(makeAddr("token"));
        vm.expectRevert("token is not a contract");
        script.deploy(config);
    }

    function test_rejectsSingleSignerSafe() public {
        config.safe = address(new MockSafe(1, 3));
        vm.expectRevert("Safe threshold is below 2");
        script.deploy(config);
    }

    function test_rejectsSafeWithTwoOwners() public {
        config.safe = address(new MockSafe(2, 2));
        vm.expectRevert("Safe has fewer than 3 owners");
        script.deploy(config);
    }

    function test_rejectsPlainWalletAsTimelock() public {
        config.timelock = makeAddr("wallet");
        vm.expectRevert("timelock is not a contract");
        script.deploy(config);
    }

    function test_rejectsTimelockWithoutDelay() public {
        config.timelock = address(new MockTimelock(0));
        vm.expectRevert("timelock has no delay");
        script.deploy(config);
    }

    function test_rejectsTimelockTheSafeCannotPropose() public {
        config.timelock = address(new MockTimelock(2 days));
        vm.expectRevert("Safe cannot propose on the timelock");
        script.deploy(config);
    }

    function test_rejectsTimelockNobodyCanExecute() public {
        MockTimelock stuck = new MockTimelock(2 days);
        stuck.grant(PROPOSER_ROLE, address(safe));
        config.timelock = address(stuck);
        vm.expectRevert("Safe cannot execute on the timelock");
        script.deploy(config);
    }

    function test_rejectsTimelockTheDeployerControls() public {
        // In a test the broadcaster is forge's default sender.
        timelock.grant(0x00, DEFAULT_SENDER);
        vm.expectRevert("deployer still controls the timelock");
        script.deploy(config);
    }
}
