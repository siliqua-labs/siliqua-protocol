// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {SiliquaOracle} from "../src/SiliquaOracle.sol";
import {ISiliquaOracle} from "../src/interfaces/ISiliquaOracle.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {MockERC20} from "./MockERC20.sol";

/// Oracle with three operators whose keys the tests hold, plus helpers to sign and relay.
abstract contract OracleBase is Test {
    uint256 internal constant PK1 = 0xA11CE;
    uint256 internal constant PK2 = 0xB0B;
    uint256 internal constant PK3 = 0xCA401;

    address internal admin = makeAddr("admin");
    address internal guardian = makeAddr("guardian");
    address internal relayer = makeAddr("relayer");

    bytes32 internal constant GRI_H100 = keccak256("GRI-H100");
    uint32 internal constant V1 = 10_000;
    uint32 internal constant HOUR = 3600;

    SiliquaOracle internal oracle;
    uint256 internal nextNonce = 1;

    function setUp() public virtual {
        // A realistic, hour-aligned clock: 2026-11-23 08:00:00 UTC.
        vm.warp(1_795_420_800);
        oracle = new SiliquaOracle(admin, guardian, 2, V1);
        vm.startPrank(admin);
        oracle.addOperator(vm.addr(PK1));
        oracle.addOperator(vm.addr(PK2));
        oracle.addOperator(vm.addr(PK3));
        oracle.registerIndex(GRI_H100, HOUR, 6, 5, 100);
        vm.stopPrank();
    }

    function report(bytes32 id, uint64 ts, uint256 value, uint8 sources, uint256 nonce)
        internal
        pure
        returns (ISiliquaOracle.Report memory)
    {
        return ISiliquaOracle.Report(id, ts, value, sources, V1, nonce);
    }

    function sign(uint256 pk, ISiliquaOracle.Report memory r) internal view returns (bytes memory) {
        (uint8 v, bytes32 rr, bytes32 s) = vm.sign(pk, digestOf(r));
        return abi.encodePacked(rr, s, v);
    }

    function digestOf(ISiliquaOracle.Report memory r) internal view returns (bytes32) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("SiliquaOracle"),
                keccak256("1"),
                block.chainid,
                address(oracle)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                oracle.REPORT_TYPEHASH(), r.indexId, r.timestamp, r.value, r.sources, r.methodologyVersion, r.nonce
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domain, structHash));
    }

    function submitOne(uint256 pk, bytes32 id, uint64 ts, uint256 value) internal {
        ISiliquaOracle.Report[] memory rs = new ISiliquaOracle.Report[](1);
        bytes[] memory sigs = new bytes[](1);
        rs[0] = report(id, ts, value, 6, nextNonce++);
        sigs[0] = sign(pk, rs[0]);
        vm.prank(relayer);
        oracle.submit(rs, sigs);
    }

    /// One batch with up to three operators' values for one slot, in key order PK1..PK3.
    function submitSlot(bytes32 id, uint64 ts, uint256[] memory values) internal {
        uint256[3] memory pks = [PK1, PK2, PK3];
        ISiliquaOracle.Report[] memory rs = new ISiliquaOracle.Report[](values.length);
        bytes[] memory sigs = new bytes[](values.length);
        for (uint256 i; i < values.length; ++i) {
            rs[i] = report(id, ts, values[i], 6, nextNonce++);
            sigs[i] = sign(pks[i], rs[i]);
        }
        vm.prank(relayer);
        oracle.submit(rs, sigs);
    }

    function values3(uint256 a, uint256 b, uint256 c) internal pure returns (uint256[] memory v) {
        v = new uint256[](3);
        v[0] = a;
        v[1] = b;
        v[2] = c;
    }

    function values2(uint256 a, uint256 b) internal pure returns (uint256[] memory v) {
        v = new uint256[](2);
        v[0] = a;
        v[1] = b;
    }

    /// Slot start `hoursAgo` hours before the current hour, and the clock moved past its end.
    function closedSlot(uint64 slotStart) internal {
        vm.warp(uint256(slotStart) + HOUR + 1);
    }
}
