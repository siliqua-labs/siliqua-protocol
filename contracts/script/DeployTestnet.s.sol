// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {ISiliquaOracle} from "../src/interfaces/ISiliquaOracle.sol";
import {SiliquaOracle} from "../src/SiliquaOracle.sol";
import {FeeRouter} from "../src/FeeRouter.sol";
import {MarketFactory} from "../src/MarketFactory.sol";

/// Testnet only. The broadcaster deploys and configures, then hands oracle admin, guardian and
/// factory owner to ADMIN: a single EOA stands in for the multisig and timelock that mainnet
/// requires. The hand-over is one step with no acceptance, so ADMIN is checked before anything is
/// sent. All addresses come from the environment; no key is read here (pass --account to forge).
contract DeployTestnet is Script {
    uint256 internal constant TESTNET_CHAIN_ID = 46630;
    uint32 internal constant METHODOLOGY_V1 = 10_000;
    uint32 internal constant HOUR = 3600;
    uint8 internal constant GRI_DECIMALS = 6;
    uint8 internal constant GRI_MIN_SOURCES = 5;
    uint16 internal constant TOLERANCE_BPS = 100;

    function run() external {
        require(block.chainid == TESTNET_CHAIN_ID, "not the Robinhood testnet");

        IERC20 token = IERC20(vm.envAddress("TOKEN"));
        require(token.decimals() == 6, "token must have 6 decimals");

        address[3] memory operators =
            [vm.envAddress("OPERATOR_1"), vm.envAddress("OPERATOR_2"), vm.envAddress("OPERATOR_3")];
        address admin = vm.envAddress("ADMIN");
        require(admin != address(0), "ADMIN is not set");
        address keeper = vm.envAddress("KEEPER");
        address buyback = vm.envAddress("FEE_BUYBACK");
        address treasury = vm.envAddress("FEE_TREASURY");
        address operatorsShare = vm.envAddress("FEE_OPERATORS");

        vm.startBroadcast();
        address deployer = msg.sender;
        require(admin != deployer, "ADMIN must differ from the deploying wallet, or drop the hand-over");

        SiliquaOracle oracle = new SiliquaOracle(deployer, deployer, 2, METHODOLOGY_V1);
        for (uint256 i = 0; i < operators.length; ++i) {
            oracle.addOperator(operators[i]);
        }
        string[5] memory classes = ["GRI-4090", "GRI-A100", "GRI-B200", "GRI-H100", "GRI-H200"];
        for (uint256 i = 0; i < classes.length; ++i) {
            oracle.registerIndex(keccak256(bytes(classes[i])), HOUR, GRI_DECIMALS, GRI_MIN_SOURCES, TOLERANCE_BPS);
        }

        FeeRouter router = new FeeRouter(buyback, treasury, operatorsShare);
        MarketFactory factory = new MarketFactory(
            token,
            ISiliquaOracle(address(oracle)),
            deployer,
            deployer,
            MarketFactory.Template({
                feeRouter: address(router),
                feeBps: 200,
                betCapWholeTokens: 1_000,
                closeBeforeTwap: 24 hours,
                twapWindow: 24 hours,
                maxStaleTime: 6 hours
            })
        );
        factory.setKeeper(keeper, true);

        oracle.setGuardian(admin);
        oracle.transferAdmin(admin);
        factory.setGuardian(admin);
        factory.transferOwnership(admin);
        vm.stopBroadcast();

        require(oracle.admin() == admin && oracle.guardian() == admin, "oracle hand-over failed");
        require(factory.owner() == admin && factory.guardian() == admin, "factory hand-over failed");

        console.log("deployer:", deployer);
        console.log("admin / guardian / owner:", admin);
        console.log("SiliquaOracle:", address(oracle));
        console.log("FeeRouter:", address(router));
        console.log("MarketFactory:", address(factory));
    }
}
