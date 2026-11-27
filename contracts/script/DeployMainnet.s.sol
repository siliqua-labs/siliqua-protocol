// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
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

/// Robinhood Chain mainnet only. The broadcaster deploys and configures, then keeps no role: a new
/// timelock becomes oracle admin, factory owner and registry admin, and the Safe is guardian. Only the
/// Safe can propose, cancel and execute on the timelock, which has no admin besides itself.
/// Variables carry a MAINNET_ prefix so a testnet value left in .env is never picked up. No key is
/// read here (pass --account to forge).
contract DeployMainnet is Script {
    uint256 internal constant MAINNET_CHAIN_ID = 4663;
    uint32 internal constant METHODOLOGY_V1 = 10_000;
    uint32 internal constant HOUR = 3600;
    uint8 internal constant GRI_DECIMALS = 6;
    uint8 internal constant GRI_MIN_SOURCES = 5;
    uint16 internal constant TOLERANCE_BPS = 100;
    // Owner decision 2026-11-27: short enough to replace a key or unpause the same day. The Safe can
    // change it with updateDelay through the timelock, without a new deployment.
    uint256 internal constant TIMELOCK_DELAY = 1 hours;

    struct Config {
        IERC20 token;
        address safe;
        address[3] operators;
        address keeper;
        address feeBuyback;
        address feeTreasury;
        address feeOperators;
        uint32 betCapWholeTokens;
    }

    struct Deployment {
        TimelockController timelock;
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

        address[] memory safeOnly = new address[](1);
        safeOnly[0] = c.safe;
        d.timelock = new TimelockController(TIMELOCK_DELAY, safeOnly, safeOnly, address(0));
        address admin = address(d.timelock);

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

        d.oracle.transferAdmin(admin);
        d.factory.transferOwnership(admin);
        d.registry.transferAdmin(admin);
        vm.stopBroadcast();

        require(d.oracle.admin() == admin && d.oracle.guardian() == c.safe, "oracle hand-over failed");
        require(d.factory.owner() == admin && d.factory.guardian() == c.safe, "factory hand-over failed");
        require(d.registry.admin() == admin, "registry hand-over failed");

        console.log("deployer (no role left):", deployer);
        console.log("Safe (guardian):", c.safe);
        console.log("TimelockController (admin, owner):", admin);
        console.log("timelock delay in seconds:", d.timelock.getMinDelay());
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
}
