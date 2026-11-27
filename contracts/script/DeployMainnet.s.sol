// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {ISiliquaOracle} from "../src/interfaces/ISiliquaOracle.sol";
import {OracleRegistry} from "../src/OracleRegistry.sol";
import {SiliquaOracle} from "../src/SiliquaOracle.sol";
import {FeeRouter} from "../src/FeeRouter.sol";
import {MarketFactory} from "../src/MarketFactory.sol";

interface ISafe {
    function getThreshold() external view returns (uint256);
    function getOwners() external view returns (address[] memory);
}

/// The read surface of OpenZeppelin's TimelockController. The timelock is deployed beforehand; this
/// script only checks it, because a wrong admin address cannot be corrected afterwards.
interface ITimelock {
    function getMinDelay() external view returns (uint256);
    function hasRole(bytes32 role, address account) external view returns (bool);
}

/// Robinhood Chain mainnet only. The broadcaster deploys and configures, then keeps no role: the
/// timelock becomes oracle admin, factory owner and registry admin, and the Safe is guardian.
/// Variables carry a MAINNET_ prefix so a testnet value left in .env is never picked up. No key is
/// read here (pass --account to forge).
contract DeployMainnet is Script {
    uint256 internal constant MAINNET_CHAIN_ID = 4663;
    uint32 internal constant METHODOLOGY_V1 = 10_000;
    uint32 internal constant HOUR = 3600;
    uint8 internal constant GRI_DECIMALS = 6;
    uint8 internal constant GRI_MIN_SOURCES = 5;
    uint16 internal constant TOLERANCE_BPS = 100;

    bytes32 internal constant ADMIN_ROLE = 0x00;
    bytes32 internal constant PROPOSER_ROLE = keccak256("PROPOSER_ROLE");
    bytes32 internal constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");

    struct Config {
        IERC20 token;
        address safe;
        address timelock;
        address[3] operators;
        address keeper;
        address feeBuyback;
        address feeTreasury;
        address feeOperators;
        uint32 betCapWholeTokens;
    }

    struct Deployment {
        OracleRegistry registry;
        SiliquaOracle oracle;
        FeeRouter router;
        MarketFactory factory;
    }

    function run() external returns (Deployment memory) {
        uint256 betCap = vm.envUint("MAINNET_BET_CAP_TOKENS");
        require(betCap <= type(uint32).max, "bet cap does not fit uint32");

        return deploy(
            Config({
                token: IERC20(vm.envAddress("MAINNET_TOKEN")),
                safe: vm.envAddress("MAINNET_SAFE"),
                timelock: vm.envAddress("MAINNET_TIMELOCK"),
                operators: [
                    vm.envAddress("MAINNET_OPERATOR_1"),
                    vm.envAddress("MAINNET_OPERATOR_2"),
                    vm.envAddress("MAINNET_OPERATOR_3")
                ],
                keeper: vm.envAddress("MAINNET_KEEPER"),
                feeBuyback: vm.envAddress("MAINNET_FEE_BUYBACK"),
                feeTreasury: vm.envAddress("MAINNET_FEE_TREASURY"),
                feeOperators: vm.envAddress("MAINNET_FEE_OPERATORS"),
                betCapWholeTokens: uint32(betCap)
            })
        );
    }

    function deploy(Config memory c) public returns (Deployment memory d) {
        require(block.chainid == MAINNET_CHAIN_ID, "not Robinhood Chain mainnet");
        require(address(c.token).code.length != 0, "token is not a contract");
        require(c.keeper != address(0), "keeper is not set");
        _checkSafe(c.safe);

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        _checkTimelock(c.timelock, c.safe, deployer);

        d.registry = new OracleRegistry(deployer);
        d.oracle = new SiliquaOracle(deployer, c.safe, 2, METHODOLOGY_V1);
        for (uint256 i = 0; i < c.operators.length; ++i) {
            d.oracle.addOperator(c.operators[i]);
        }
        string[5] memory classes = ["GRI-4090", "GRI-A100", "GRI-B200", "GRI-H100", "GRI-H200"];
        for (uint256 i = 0; i < classes.length; ++i) {
            d.oracle.registerIndex(keccak256(bytes(classes[i])), HOUR, GRI_DECIMALS, GRI_MIN_SOURCES, TOLERANCE_BPS);
        }

        d.router = new FeeRouter(c.feeBuyback, c.feeTreasury, c.feeOperators);
        d.factory = new MarketFactory(
            c.token,
            ISiliquaOracle(address(d.oracle)),
            deployer,
            c.safe,
            MarketFactory.Template({
                feeRouter: address(d.router),
                feeBps: 200,
                betCapWholeTokens: c.betCapWholeTokens,
                closeBeforeTwap: 24 hours,
                twapWindow: 24 hours,
                maxStaleTime: 6 hours
            })
        );
        d.factory.setKeeper(c.keeper, true);
        d.registry.register(d.registry.ORACLE(), address(d.oracle));
        d.registry.register(d.registry.FACTORY(), address(d.factory));

        d.oracle.transferAdmin(c.timelock);
        d.factory.transferOwnership(c.timelock);
        d.registry.transferAdmin(c.timelock);
        vm.stopBroadcast();

        require(d.oracle.admin() == c.timelock && d.oracle.guardian() == c.safe, "oracle hand-over failed");
        require(d.factory.owner() == c.timelock && d.factory.guardian() == c.safe, "factory hand-over failed");
        require(d.registry.admin() == c.timelock, "registry hand-over failed");

        console.log("deployer (no role left):", deployer);
        console.log("Safe (guardian):", c.safe);
        console.log("timelock (admin, owner):", c.timelock);
        console.log("timelock delay in seconds:", ITimelock(c.timelock).getMinDelay());
        console.log("token:", address(c.token));
        console.log("token decimals:", d.factory.tokenDecimals());
        console.log("bet cap in whole tokens:", c.betCapWholeTokens);
        console.log("OracleRegistry:", address(d.registry));
        console.log("SiliquaOracle:", address(d.oracle));
        console.log("FeeRouter:", address(d.router));
        console.log("MarketFactory:", address(d.factory));
    }

    function _checkSafe(address safe) private view {
        require(safe.code.length != 0, "Safe is not a contract");
        require(ISafe(safe).getThreshold() >= 2, "Safe threshold is below 2");
        require(ISafe(safe).getOwners().length >= 3, "Safe has fewer than 3 owners");
    }

    function _checkTimelock(address timelock, address safe, address deployer) private view {
        require(timelock.code.length != 0, "timelock is not a contract");
        ITimelock t = ITimelock(timelock);
        require(t.getMinDelay() != 0, "timelock has no delay");
        require(t.hasRole(PROPOSER_ROLE, safe), "Safe cannot propose on the timelock");
        // The zero address holding the role means anyone may execute a ready operation.
        require(
            t.hasRole(EXECUTOR_ROLE, safe) || t.hasRole(EXECUTOR_ROLE, address(0)),
            "Safe cannot execute on the timelock"
        );
        require(
            !t.hasRole(ADMIN_ROLE, deployer) && !t.hasRole(PROPOSER_ROLE, deployer),
            "deployer still controls the timelock"
        );
    }
}
