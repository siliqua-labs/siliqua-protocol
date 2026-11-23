// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {SiliquaOracle} from "../src/SiliquaOracle.sol";
import {ISiliquaOracle} from "../src/interfaces/ISiliquaOracle.sol";

/// test-vectors/oracle-signatures-v1.json was signed outside Solidity (viem; eth-account checks
/// the same file). The contract must compute the same digest and recover the same signer.
contract SignaturesTest is Test {
    function test_contractAcceptsReportsSignedByOtherLibraries() public {
        string memory json = vm.readFile("../test-vectors/oracle-signatures-v1.json");
        address signer = vm.parseJsonAddress(json, ".signer");
        address oracleAddress = vm.parseJsonAddress(json, ".oracle");
        vm.chainId(vm.parseJsonUint(json, ".chainId"));

        // The domain separator binds the address, so the oracle must live where the fixture says.
        address admin = makeAddr("admin");
        deployCodeTo("SiliquaOracle.sol", abi.encode(admin, admin, uint8(2), uint32(10_000)), oracleAddress);
        SiliquaOracle oracle = SiliquaOracle(oracleAddress);
        vm.startPrank(admin);
        oracle.addOperator(signer);
        oracle.registerIndex(keccak256("GRI-H100"), 3600, 6, 5, 100);
        oracle.registerIndex(keccak256("CMI-AGENTS"), 86_400, 0, 2, 100);
        vm.stopPrank();

        uint256 n = abi.decode(vm.parseJson(json, ".cases[*].name"), (string[])).length;
        assertEq(n, 3);
        for (uint256 i; i < n; ++i) {
            _check(oracle, json, string.concat(".cases[", vm.toString(i), "]"), signer);
        }
    }

    function _check(SiliquaOracle oracle, string memory json, string memory p, address signer) internal {
        ISiliquaOracle.Report[] memory rs = new ISiliquaOracle.Report[](1);
        rs[0] = ISiliquaOracle.Report({
            indexId: vm.parseJsonBytes32(json, string.concat(p, ".report.indexId")),
            timestamp: uint64(vm.parseJsonUint(json, string.concat(p, ".report.timestamp"))),
            value: vm.parseJsonUint(json, string.concat(p, ".report.value")),
            sources: uint8(vm.parseJsonUint(json, string.concat(p, ".report.sources"))),
            methodologyVersion: uint32(vm.parseJsonUint(json, string.concat(p, ".report.methodologyVersion"))),
            nonce: vm.parseJsonUint(json, string.concat(p, ".report.nonce"))
        });
        string memory name = vm.parseJsonString(json, string.concat(p, ".name"));
        assertEq(oracle.hashReport(rs[0]), vm.parseJsonBytes32(json, string.concat(p, ".digest")), name);

        bytes[] memory sigs = new bytes[](1);
        sigs[0] = vm.parseJsonBytes(json, string.concat(p, ".signature"));
        vm.warp(uint256(rs[0].timestamp) + oracle.indexConfig(rs[0].indexId).period);
        oracle.submit(rs, sigs);
        assertEq(oracle.submittedCount(rs[0].indexId, rs[0].timestamp), 1, name);
        assertTrue(oracle.isOperator(signer));
    }
}
