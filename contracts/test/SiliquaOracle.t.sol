// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {OracleBase} from "./Base.sol";
import {SiliquaOracle} from "../src/SiliquaOracle.sol";
import {ISiliquaOracle} from "../src/interfaces/ISiliquaOracle.sol";

contract SiliquaOracleTest is OracleBase {
    // The slot 2026-11-23 08:00 UTC of docs/spec/oracle-v1.md section 3.
    uint64 internal constant SLOT = 1_795_420_800;
    uint64 internal constant OPENS = SLOT + 3600;
    uint64 internal constant CLOSES = SLOT + 3600 + 3 hours;

    event ReportRejected(bytes32 indexed indexId, uint64 indexed timestamp, address operator, uint8 reason);
    event OperatorValue(
        bytes32 indexed indexId,
        uint64 indexed timestamp,
        address indexed operator,
        uint256 value,
        uint8 sources,
        uint32 methodologyVersion,
        uint256 nonce,
        bool counted
    );
    event SlotFinalized(
        bytes32 indexed indexId,
        uint64 indexed timestamp,
        uint256 value,
        uint8 keptCount,
        uint8 submittedCount,
        uint32 methodologyVersion
    );

    function _slot() internal view returns (bool finalized, uint256 value, uint8 sources, uint8 kept) {
        (finalized, value, sources,,, kept) = oracle.getSlot(GRI_H100, SLOT);
    }

    function _expectReject(uint64 ts, address operator, SiliquaOracle.Reason reason) internal {
        vm.expectEmit(true, true, false, true, address(oracle));
        emit ReportRejected(GRI_H100, ts, operator, uint8(reason));
    }

    // ------------------------------------------------------------------ spec examples

    function test_slotWindowMatchesSpecExample() public pure {
        assertEq(OPENS, 1_795_424_400);
        assertEq(CLOSES, 1_795_435_200);
    }

    function test_exampleA_threeCloseValuesFinalizeAtTheMedian() public {
        vm.warp(OPENS);
        submitSlot(GRI_H100, SLOT, values3(3_520_000, 3_523_000, 3_530_000));
        (bool finalized, uint256 value, uint8 sources, uint8 kept) = _slot();
        assertTrue(finalized);
        assertEq(value, 3_523_000);
        assertEq(sources, 6);
        assertEq(kept, 3);
    }

    function test_exampleB_outlierIsDroppedAndEmittedAsAValue() public {
        vm.warp(OPENS);
        vm.expectEmit(true, true, true, false, address(oracle));
        emit OperatorValue(GRI_H100, SLOT, vm.addr(PK3), 3_700_000, 6, V1, 3, true);
        vm.expectEmit(true, true, false, true, address(oracle));
        emit SlotFinalized(GRI_H100, SLOT, 3_521_500, 2, 3, V1);
        submitSlot(GRI_H100, SLOT, values3(3_520_000, 3_523_000, 3_700_000));
        (bool finalized, uint256 value,, uint8 kept) = _slot();
        assertTrue(finalized);
        assertEq(value, 3_521_500);
        assertEq(kept, 2);
    }

    function test_exampleC_twoValuesRoundHalfUp() public {
        vm.warp(OPENS);
        submitSlot(GRI_H100, SLOT, values2(3_520_001, 3_523_000));
        (, uint256 value,,) = _slot();
        assertEq(value, 3_521_501);
    }

    function test_exampleD_twoFarValuesDoNotFinalize() public {
        vm.warp(OPENS);
        submitSlot(GRI_H100, SLOT, values2(3_520_000, 3_600_000));
        (bool finalized,,,) = _slot();
        assertFalse(finalized);
    }

    function test_exampleE_oneKeptDoesNotFinalize() public {
        vm.warp(OPENS);
        submitSlot(GRI_H100, SLOT, values3(3_000_000, 3_500_000, 4_000_000));
        (bool finalized,,,) = _slot();
        assertFalse(finalized);
    }

    function test_exampleF_twoColludingOperatorsDecide() public {
        vm.warp(OPENS);
        submitSlot(GRI_H100, SLOT, values3(3_500_000, 5_000_000, 5_000_000));
        (, uint256 value,,) = _slot();
        assertEq(value, 5_000_000);
    }

    // ------------------------------------------------------------------ batches and finalization

    function test_finalizationIsAtTheEndOfTheBatchSoOrderDoesNotMatter() public {
        vm.warp(OPENS);
        // Two values first would finalize at 3 525 000; the third has to be part of the evidence.
        submitSlot(GRI_H100, SLOT, values3(3_520_000, 3_530_000, 3_523_000));
        (, uint256 value,, uint8 kept) = _slot();
        assertEq(value, 3_523_000);
        assertEq(kept, 3);
    }

    function test_aLateOperatorCompletesASlotInALaterBatch() public {
        vm.warp(OPENS);
        submitOne(PK1, GRI_H100, SLOT, 3_520_000);
        (bool finalized,,,) = _slot();
        assertFalse(finalized);
        vm.warp(OPENS + 2 hours);
        submitOne(PK2, GRI_H100, SLOT, 3_522_000);
        (bool done, uint256 value,,) = _slot();
        assertTrue(done);
        assertEq(value, 3_521_000);
    }

    function test_theThirdValueAfterFinalizationIsRecordedButDoesNotCount() public {
        vm.warp(OPENS);
        submitSlot(GRI_H100, SLOT, values2(3_520_000, 3_524_000));
        vm.expectEmit(true, true, true, true, address(oracle));
        emit OperatorValue(GRI_H100, SLOT, vm.addr(PK3), 3_900_000, 6, V1, nextNonce, false);
        submitOne(PK3, GRI_H100, SLOT, 3_900_000);
        (, uint256 value,, uint8 kept) = _slot();
        assertEq(value, 3_522_000, "a finalized slot never changes");
        assertEq(kept, 2);
        assertEq(oracle.submittedCount(GRI_H100, SLOT), 3);
    }

    function test_slotReportsTheWeakestKeptSources() public {
        vm.warp(OPENS);
        ISiliquaOracle.Report[] memory rs = new ISiliquaOracle.Report[](3);
        bytes[] memory sigs = new bytes[](3);
        uint256[3] memory pks = [PK1, PK2, PK3];
        uint8[3] memory src = [uint8(9), 7, 5];
        uint256[3] memory vals = [uint256(3_520_000), 3_523_000, 3_900_000];
        for (uint256 i; i < 3; ++i) {
            rs[i] = report(GRI_H100, SLOT, vals[i], src[i], i + 1);
            sigs[i] = sign(pks[i], rs[i]);
        }
        oracle.submit(rs, sigs);
        (,, uint8 sources,) = _slot();
        // The 5-source value was the dropped outlier, so it does not weaken the slot.
        assertEq(sources, 7);
    }

    function test_latestFollowsTheNewestFinalizedSlot() public {
        vm.warp(OPENS);
        submitSlot(GRI_H100, SLOT, values3(3_520_000, 3_523_000, 3_530_000));
        (uint64 ts, uint256 value) = oracle.latest(GRI_H100);
        assertEq(ts, SLOT);
        assertEq(value, 3_523_000);

        vm.warp(OPENS + 1 hours);
        submitSlot(GRI_H100, SLOT + 3600, values2(3_600_000, 3_601_000));
        (ts, value) = oracle.latest(GRI_H100);
        assertEq(ts, SLOT + 3600);
        assertEq(value, 3_600_500);

        // An older slot finalized later does not move `latest` backwards.
        vm.warp(OPENS + 1 hours);
        (ts,) = oracle.latest(GRI_H100);
        assertEq(ts, SLOT + 3600);
    }

    // ------------------------------------------------------------------ rejections

    function test_rejectsUnknownIndexWithoutRevertingTheBatch() public {
        vm.warp(OPENS);
        ISiliquaOracle.Report[] memory rs = new ISiliquaOracle.Report[](2);
        bytes[] memory sigs = new bytes[](2);
        rs[0] = report(keccak256("GRI-NOPE"), SLOT, 1, 6, 1);
        sigs[0] = sign(PK1, rs[0]);
        rs[1] = report(GRI_H100, SLOT, 3_500_000, 6, 2);
        sigs[1] = sign(PK1, rs[1]);
        vm.expectEmit(true, true, false, true, address(oracle));
        emit ReportRejected(keccak256("GRI-NOPE"), SLOT, address(0), uint8(SiliquaOracle.Reason.UnknownIndex));
        oracle.submit(rs, sigs);
        assertEq(oracle.submittedCount(GRI_H100, SLOT), 1, "the good report still went in");
    }

    function test_rejectsTimestampOffTheSlotGrid() public {
        vm.warp(OPENS + 1 hours);
        ISiliquaOracle.Report[] memory rs = new ISiliquaOracle.Report[](1);
        bytes[] memory sigs = new bytes[](1);
        rs[0] = report(GRI_H100, SLOT + 1, 3_500_000, 6, 1);
        sigs[0] = sign(PK1, rs[0]);
        _expectReject(SLOT + 1, address(0), SiliquaOracle.Reason.BadTimestamp);
        oracle.submit(rs, sigs);
    }

    function test_rejectsValueZeroAndValueAtOrAbove2To128() public {
        vm.warp(OPENS);
        uint256[3] memory bad = [uint256(0), uint256(1) << 128, type(uint256).max];
        for (uint256 i; i < bad.length; ++i) {
            ISiliquaOracle.Report[] memory rs = new ISiliquaOracle.Report[](1);
            bytes[] memory sigs = new bytes[](1);
            rs[0] = report(GRI_H100, SLOT, bad[i], 6, i + 1);
            sigs[0] = sign(PK1, rs[0]);
            _expectReject(SLOT, address(0), SiliquaOracle.Reason.ValueOutOfRange);
            oracle.submit(rs, sigs);
        }
        assertEq(oracle.submittedCount(GRI_H100, SLOT), 0);
    }

    function test_theLargestAllowedValueIsAccepted() public {
        vm.warp(OPENS);
        uint256 max = (uint256(1) << 128) - 1;
        submitSlot(GRI_H100, SLOT, values2(max, max));
        (, uint256 value,,) = _slot();
        assertEq(value, max);
    }

    function test_rejectsBeforeTheSlotHasEnded() public {
        vm.warp(OPENS - 1);
        ISiliquaOracle.Report[] memory rs = new ISiliquaOracle.Report[](1);
        bytes[] memory sigs = new bytes[](1);
        rs[0] = report(GRI_H100, SLOT, 3_500_000, 6, 7);
        sigs[0] = sign(PK1, rs[0]);
        _expectReject(SLOT, address(0), SiliquaOracle.Reason.WindowNotOpen);
        oracle.submit(rs, sigs);

        // The nonce was not consumed, so the same report works one second later.
        vm.warp(OPENS);
        oracle.submit(rs, sigs);
        assertEq(oracle.submittedCount(GRI_H100, SLOT), 1);
    }

    function test_acceptsOnTheLastSecondOfTheLateWindowAndRejectsAfter() public {
        vm.warp(CLOSES);
        submitOne(PK1, GRI_H100, SLOT, 3_500_000);
        assertEq(oracle.submittedCount(GRI_H100, SLOT), 1);

        vm.warp(CLOSES + 1);
        ISiliquaOracle.Report[] memory rs = new ISiliquaOracle.Report[](1);
        bytes[] memory sigs = new bytes[](1);
        rs[0] = report(GRI_H100, SLOT, 3_500_000, 6, 99);
        sigs[0] = sign(PK2, rs[0]);
        _expectReject(SLOT, address(0), SiliquaOracle.Reason.WindowClosed);
        oracle.submit(rs, sigs);
        assertEq(oracle.submittedCount(GRI_H100, SLOT), 1);
    }

    function test_rejectsASignerOutsideTheAllowlist() public {
        vm.warp(OPENS);
        uint256 stranger = 0xBAD;
        ISiliquaOracle.Report[] memory rs = new ISiliquaOracle.Report[](1);
        bytes[] memory sigs = new bytes[](1);
        rs[0] = report(GRI_H100, SLOT, 3_500_000, 6, 1);
        sigs[0] = sign(stranger, rs[0]);
        _expectReject(SLOT, vm.addr(stranger), SiliquaOracle.Reason.UnknownSigner);
        oracle.submit(rs, sigs);
    }

    function test_aRemovedOperatorCanNoLongerReport() public {
        vm.prank(guardian);
        oracle.removeOperator(vm.addr(PK3));
        vm.warp(OPENS);
        ISiliquaOracle.Report[] memory rs = new ISiliquaOracle.Report[](1);
        bytes[] memory sigs = new bytes[](1);
        rs[0] = report(GRI_H100, SLOT, 3_500_000, 6, 1);
        sigs[0] = sign(PK3, rs[0]);
        _expectReject(SLOT, vm.addr(PK3), SiliquaOracle.Reason.UnknownSigner);
        oracle.submit(rs, sigs);
    }

    function test_aSignatureForAnotherValueRecoversToAnotherAddress() public {
        vm.warp(OPENS);
        ISiliquaOracle.Report[] memory rs = new ISiliquaOracle.Report[](1);
        bytes[] memory sigs = new bytes[](1);
        rs[0] = report(GRI_H100, SLOT, 3_500_000, 6, 1);
        sigs[0] = sign(PK1, rs[0]);
        rs[0].value = 3_600_000; // tampered after signing
        oracle.submit(rs, sigs);
        assertEq(oracle.submittedCount(GRI_H100, SLOT), 0);
    }

    function test_aSignatureForAnotherChainIsRejected() public {
        vm.warp(OPENS);
        ISiliquaOracle.Report[] memory rs = new ISiliquaOracle.Report[](1);
        bytes[] memory sigs = new bytes[](1);
        rs[0] = report(GRI_H100, SLOT, 3_500_000, 6, 1);
        sigs[0] = sign(PK1, rs[0]);
        vm.chainId(block.chainid + 1);
        oracle.submit(rs, sigs);
        assertEq(oracle.submittedCount(GRI_H100, SLOT), 0);
    }

    function test_aSignatureForAnotherOracleIsRejected() public {
        vm.warp(OPENS);
        ISiliquaOracle.Report[] memory rs = new ISiliquaOracle.Report[](1);
        bytes[] memory sigs = new bytes[](1);
        rs[0] = report(GRI_H100, SLOT, 3_500_000, 6, 1);
        sigs[0] = sign(PK1, rs[0]);

        SiliquaOracle other = new SiliquaOracle(admin, guardian, 2, V1);
        vm.startPrank(admin);
        other.addOperator(vm.addr(PK1));
        other.registerIndex(GRI_H100, HOUR, 6, 5, 100);
        vm.stopPrank();
        other.submit(rs, sigs);
        assertEq(other.submittedCount(GRI_H100, SLOT), 0);
    }

    function test_rejectsAHighSMalleatedTwinOfAValidSignature() public {
        vm.warp(OPENS);
        ISiliquaOracle.Report[] memory rs = new ISiliquaOracle.Report[](1);
        bytes[] memory sigs = new bytes[](1);
        rs[0] = report(GRI_H100, SLOT, 3_500_000, 6, 1);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(PK1, digestOf(rs[0]));
        uint256 n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
        bytes32 highS = bytes32(n - uint256(s));
        uint8 flippedV = v == 27 ? 28 : 27;
        sigs[0] = abi.encodePacked(r, highS, flippedV);
        // The twin recovers to the same signer in raw ecrecover, so only the s check stops it.
        assertEq(ecrecover(digestOf(rs[0]), flippedV, r, highS), vm.addr(PK1));
        _expectReject(SLOT, address(0), SiliquaOracle.Reason.UnknownSigner);
        oracle.submit(rs, sigs);
    }

    function test_rejectsMalformedSignatures() public {
        vm.warp(OPENS);
        ISiliquaOracle.Report[] memory rs = new ISiliquaOracle.Report[](3);
        bytes[] memory sigs = new bytes[](3);
        for (uint256 i; i < 3; ++i) {
            rs[i] = report(GRI_H100, SLOT, 3_500_000, 6, i + 1);
        }
        sigs[0] = hex"";
        sigs[1] = new bytes(64);
        bytes memory good = sign(PK1, rs[2]);
        good[64] = bytes1(uint8(29)); // v must be 27 or 28
        sigs[2] = good;
        oracle.submit(rs, sigs);
        assertEq(oracle.submittedCount(GRI_H100, SLOT), 0);
    }

    function test_rejectsAnUnregisteredMethodologyAndMixedMethodologyInOneSlot() public {
        vm.warp(OPENS);
        ISiliquaOracle.Report[] memory rs = new ISiliquaOracle.Report[](1);
        bytes[] memory sigs = new bytes[](1);
        rs[0] = ISiliquaOracle.Report(GRI_H100, SLOT, 3_500_000, 6, 20_000, 1);
        sigs[0] = sign(PK1, rs[0]);
        _expectReject(SLOT, vm.addr(PK1), SiliquaOracle.Reason.BadMethodology);
        oracle.submit(rs, sigs);

        // Register 2.0 effective in 14 days; a report for an older slot cannot use it, and once a
        // slot has a methodology the others must match.
        vm.prank(admin);
        oracle.registerMethodology(20_000, uint64(block.timestamp + 14 days));
        rs[0] = ISiliquaOracle.Report(GRI_H100, SLOT, 3_500_000, 6, 20_000, 2);
        sigs[0] = sign(PK1, rs[0]);
        _expectReject(SLOT, vm.addr(PK1), SiliquaOracle.Reason.BadMethodology);
        oracle.submit(rs, sigs);
    }

    function test_rejectsMixedMethodologyInsideASlot() public {
        vm.prank(admin);
        oracle.registerMethodology(20_000, uint64(block.timestamp + 14 days));
        uint64 future = uint64(block.timestamp + 14 days) / 3600 * 3600 + 3600;
        vm.warp(uint256(future) + 3600);

        ISiliquaOracle.Report[] memory rs = new ISiliquaOracle.Report[](2);
        bytes[] memory sigs = new bytes[](2);
        rs[0] = ISiliquaOracle.Report(GRI_H100, future, 3_500_000, 6, 20_000, 1);
        rs[1] = ISiliquaOracle.Report(GRI_H100, future, 3_500_000, 6, V1, 2);
        sigs[0] = sign(PK1, rs[0]);
        sigs[1] = sign(PK2, rs[1]);
        vm.expectEmit(true, true, false, true, address(oracle));
        emit ReportRejected(GRI_H100, future, vm.addr(PK2), uint8(SiliquaOracle.Reason.BadMethodology));
        oracle.submit(rs, sigs);
        assertEq(oracle.submittedCount(GRI_H100, future), 1);
    }

    function test_rejectsTooFewSources() public {
        vm.warp(OPENS);
        ISiliquaOracle.Report[] memory rs = new ISiliquaOracle.Report[](1);
        bytes[] memory sigs = new bytes[](1);
        rs[0] = report(GRI_H100, SLOT, 3_500_000, 4, 1);
        sigs[0] = sign(PK1, rs[0]);
        _expectReject(SLOT, vm.addr(PK1), SiliquaOracle.Reason.TooFewSources);
        oracle.submit(rs, sigs);
    }

    function test_rejectsASecondValueFromTheSameOperatorInASlot() public {
        vm.warp(OPENS);
        submitOne(PK1, GRI_H100, SLOT, 3_500_000);
        ISiliquaOracle.Report[] memory rs = new ISiliquaOracle.Report[](1);
        bytes[] memory sigs = new bytes[](1);
        rs[0] = report(GRI_H100, SLOT, 3_900_000, 6, 50);
        sigs[0] = sign(PK1, rs[0]);
        _expectReject(SLOT, vm.addr(PK1), SiliquaOracle.Reason.DuplicateOperator);
        oracle.submit(rs, sigs);
        assertEq(oracle.submittedCount(GRI_H100, SLOT), 1);
    }

    function test_replayingAnAcceptedReportIsRejected() public {
        vm.warp(OPENS);
        ISiliquaOracle.Report[] memory rs = new ISiliquaOracle.Report[](1);
        bytes[] memory sigs = new bytes[](1);
        rs[0] = report(GRI_H100, SLOT, 3_500_000, 6, 1);
        sigs[0] = sign(PK1, rs[0]);
        oracle.submit(rs, sigs);
        // Same bytes again: the operator already has a value, which is the first check that fires.
        _expectReject(SLOT, vm.addr(PK1), SiliquaOracle.Reason.DuplicateOperator);
        oracle.submit(rs, sigs);
    }

    function test_aNonceCannotBeReusedForAnotherSlot() public {
        vm.warp(OPENS + 1 hours);
        submitOne(PK1, GRI_H100, SLOT, 3_500_000);
        uint256 used = nextNonce - 1;
        ISiliquaOracle.Report[] memory rs = new ISiliquaOracle.Report[](1);
        bytes[] memory sigs = new bytes[](1);
        rs[0] = report(GRI_H100, SLOT + 3600, 3_500_000, 6, used);
        sigs[0] = sign(PK1, rs[0]);
        _expectReject(SLOT + 3600, vm.addr(PK1), SiliquaOracle.Reason.NonceUsed);
        oracle.submit(rs, sigs);
    }

    function test_nonceBitmapWordAndBit() public {
        // Spec section 6: nonce 515 is word 2, bit 3.
        vm.warp(OPENS);
        ISiliquaOracle.Report[] memory rs = new ISiliquaOracle.Report[](1);
        bytes[] memory sigs = new bytes[](1);
        rs[0] = report(GRI_H100, SLOT, 3_500_000, 6, 515);
        sigs[0] = sign(PK1, rs[0]);
        oracle.submit(rs, sigs);
        assertEq(oracle.nonceBitmap(vm.addr(PK1), 2), 1 << 3);
        assertEq(oracle.nonceBitmap(vm.addr(PK1), 0), 0);
    }

    function test_theBatchRevertsOnlyOnALengthMismatch() public {
        ISiliquaOracle.Report[] memory rs = new ISiliquaOracle.Report[](1);
        bytes[] memory sigs = new bytes[](0);
        vm.expectRevert(SiliquaOracle.LengthMismatch.selector);
        oracle.submit(rs, sigs);
    }

    // ------------------------------------------------------------------ administration

    function test_onlyAdminAdministers() public {
        vm.startPrank(relayer);
        vm.expectRevert(SiliquaOracle.NotAdmin.selector);
        oracle.addOperator(relayer);
        vm.expectRevert(SiliquaOracle.NotAdmin.selector);
        oracle.registerIndex(keccak256("X"), 3600, 6, 5, 100);
        vm.expectRevert(SiliquaOracle.NotAdmin.selector);
        oracle.setIndexParams(GRI_H100, 5, 100);
        vm.expectRevert(SiliquaOracle.NotAdmin.selector);
        oracle.registerMethodology(2, uint64(block.timestamp + 30 days));
        vm.expectRevert(SiliquaOracle.NotAdmin.selector);
        oracle.setMinValues(3);
        vm.expectRevert(SiliquaOracle.NotAdmin.selector);
        oracle.transferAdmin(relayer);
        vm.expectRevert(SiliquaOracle.NotAdmin.selector);
        oracle.setGuardian(relayer);
        vm.expectRevert(SiliquaOracle.NotAdminOrGuardian.selector);
        oracle.removeOperator(vm.addr(PK1));
        vm.stopPrank();
    }

    function test_guardianMayRemoveButNotAdd() public {
        vm.startPrank(guardian);
        vm.expectRevert(SiliquaOracle.NotAdmin.selector);
        oracle.addOperator(relayer);
        oracle.removeOperator(vm.addr(PK1));
        vm.stopPrank();
        assertFalse(oracle.isOperator(vm.addr(PK1)));
        assertEq(oracle.operatorCount(), 2);
    }

    function test_operatorSetLimits() public {
        vm.startPrank(admin);
        vm.expectRevert(SiliquaOracle.OperatorExists.selector);
        oracle.addOperator(vm.addr(PK1));
        vm.expectRevert(SiliquaOracle.ZeroAddress.selector);
        oracle.addOperator(address(0));
        vm.expectRevert(SiliquaOracle.OperatorMissing.selector);
        oracle.removeOperator(relayer);
        for (uint160 i = 1; i <= 12; ++i) {
            oracle.addOperator(address(i + 1000));
        }
        assertEq(oracle.operatorCount(), 15);
        vm.expectRevert(SiliquaOracle.TooManyOperators.selector);
        oracle.addOperator(address(9999));
        vm.stopPrank();
    }

    function test_methodologyNeeds14DaysNotice() public {
        vm.startPrank(admin);
        vm.expectRevert(SiliquaOracle.MethodologyTooSoon.selector);
        oracle.registerMethodology(20_000, uint64(block.timestamp + 14 days - 1));
        oracle.registerMethodology(20_000, uint64(block.timestamp + 14 days));
        vm.expectRevert(SiliquaOracle.MethodologyExists.selector);
        oracle.registerMethodology(20_000, uint64(block.timestamp + 30 days));
        vm.expectRevert(SiliquaOracle.MethodologyExists.selector);
        oracle.registerMethodology(V1, uint64(block.timestamp + 30 days));
        vm.stopPrank();
    }

    function test_indexRegistrationAndParams() public {
        vm.startPrank(admin);
        vm.expectRevert(SiliquaOracle.IndexExists.selector);
        oracle.registerIndex(GRI_H100, 3600, 6, 5, 100);
        vm.expectRevert(SiliquaOracle.BadIndexParams.selector);
        oracle.registerIndex(keccak256("X"), 0, 6, 5, 100);
        vm.expectRevert(SiliquaOracle.BadIndexParams.selector);
        oracle.registerIndex(keccak256("X"), 3600, 6, 5, 10_001);
        vm.expectRevert(SiliquaOracle.IndexMissing.selector);
        oracle.setIndexParams(keccak256("X"), 1, 1);
        oracle.setIndexParams(GRI_H100, 4, 200);
        vm.stopPrank();
        ISiliquaOracle.IndexConfig memory cfg = oracle.indexConfig(GRI_H100);
        assertEq(cfg.minSources, 4);
        assertEq(cfg.toleranceBps, 200);
    }

    function test_minValuesCannotBeBelowTwo() public {
        vm.startPrank(admin);
        vm.expectRevert(SiliquaOracle.BadMinValues.selector);
        oracle.setMinValues(1);
        oracle.setMinValues(3);
        vm.stopPrank();
        assertEq(oracle.minValues(), 3);
        vm.expectRevert(SiliquaOracle.BadMinValues.selector);
        new SiliquaOracle(admin, guardian, 1, V1);
    }

    function test_aParameterChangeNeverChangesAFinalizedSlot() public {
        vm.warp(OPENS);
        submitSlot(GRI_H100, SLOT, values3(3_520_000, 3_523_000, 3_700_000));
        vm.startPrank(admin);
        oracle.setIndexParams(GRI_H100, 5, 10_000);
        oracle.setMinValues(3);
        vm.stopPrank();
        (, uint256 value,, uint8 kept) = _slot();
        assertEq(value, 3_521_500);
        assertEq(kept, 2);
    }

    function test_adminCanBeHandedOver() public {
        address next = makeAddr("next");
        vm.prank(admin);
        oracle.transferAdmin(next);
        vm.prank(admin);
        vm.expectRevert(SiliquaOracle.NotAdmin.selector);
        oracle.addOperator(relayer);
        vm.prank(next);
        oracle.addOperator(relayer);
    }

    // ------------------------------------------------------------------ twap

    function _finalizeHours(uint64 from, uint256[] memory valuesPerHour) internal {
        for (uint256 i; i < valuesPerHour.length; ++i) {
            if (valuesPerHour[i] == 0) continue; // a stale hour
            uint64 ts = from + uint64(i) * 3600;
            vm.warp(uint256(ts) + 3600);
            submitSlot(GRI_H100, ts, values2(valuesPerHour[i], valuesPerHour[i]));
        }
    }

    function test_twapAveragesFinalizedSlotsAndCountsStaleOnes() public {
        uint256[] memory v = new uint256[](4);
        v[0] = 3_000_000;
        v[1] = 0; // stale
        v[2] = 3_000_001;
        v[3] = 3_000_002;
        _finalizeHours(SLOT, v);
        (uint256 value, uint32 used, uint32 stale) = oracle.twap(GRI_H100, SLOT, SLOT + 4 * 3600);
        assertEq(used, 3);
        assertEq(stale, 1);
        assertEq(value, 3_000_001);
    }

    function test_twapRoundsHalfUp() public {
        uint256[] memory v = new uint256[](2);
        v[0] = 3_000_000;
        v[1] = 3_000_001; // mean 3 000 000.5
        _finalizeHours(SLOT, v);
        (uint256 value,,) = oracle.twap(GRI_H100, SLOT, SLOT + 2 * 3600);
        assertEq(value, 3_000_001);
    }

    function test_twapOfAnEmptyWindowIsAllStale() public view {
        (uint256 value, uint32 used, uint32 stale) = oracle.twap(GRI_H100, SLOT, SLOT + 24 * 3600);
        assertEq(value, 0);
        assertEq(used, 0);
        assertEq(stale, 24);
    }

    function test_twapRejectsBadRanges() public {
        vm.expectRevert(SiliquaOracle.BadTwapRange.selector);
        oracle.twap(GRI_H100, SLOT, SLOT);
        vm.expectRevert(SiliquaOracle.BadTwapRange.selector);
        oracle.twap(GRI_H100, SLOT + 1, SLOT + 3601);
        vm.expectRevert(SiliquaOracle.BadTwapRange.selector);
        oracle.twap(GRI_H100, SLOT, SLOT + 169 * 3600);
        vm.expectRevert(SiliquaOracle.IndexMissing.selector);
        oracle.twap(keccak256("X"), SLOT, SLOT + 3600);
    }

    // ------------------------------------------------------------------ fuzz

    function testFuzz_aFinalizedValueLiesInsideTheKeptRange(uint128 a, uint128 b, uint128 c) public {
        uint256 x = bound(a, 1, type(uint128).max);
        uint256 y = bound(b, 1, type(uint128).max);
        uint256 z = bound(c, 1, type(uint128).max);
        vm.warp(OPENS);
        submitSlot(GRI_H100, SLOT, values3(x, y, z));
        (bool finalized, uint256 value,, uint8 kept) = _slot();
        uint256 lo = x < y ? (x < z ? x : z) : (y < z ? y : z);
        uint256 hi = x > y ? (x > z ? x : z) : (y > z ? y : z);
        if (finalized) {
            assertGe(kept, 2);
            assertGe(value, lo);
            assertLe(value, hi);
        } else {
            assertLt(kept, 2);
        }
    }

    function testFuzz_closeValuesAlwaysFinalize(uint64 base, uint8 d1, uint8 d2) public {
        uint256 m = bound(base, 1_000_000, 1_000_000_000_000);
        // Offsets below 0.5% of the value stay inside the 1% tolerance whichever is the median.
        uint256 x = m + m * (d1 % 50) / 10_000;
        uint256 y = m + m * (d2 % 50) / 10_000;
        vm.warp(OPENS);
        submitSlot(GRI_H100, SLOT, values3(m, x, y));
        (bool finalized,,, uint8 kept) = _slot();
        assertTrue(finalized);
        assertEq(kept, 3);
    }

    function testFuzz_signatureWithWrongKeyIsNeverAccepted(uint256 key) public {
        key = bound(key, 1, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364140);
        vm.assume(key != PK1 && key != PK2 && key != PK3);
        vm.warp(OPENS);
        ISiliquaOracle.Report[] memory rs = new ISiliquaOracle.Report[](1);
        bytes[] memory sigs = new bytes[](1);
        rs[0] = report(GRI_H100, SLOT, 3_500_000, 6, 1);
        sigs[0] = sign(key, rs[0]);
        oracle.submit(rs, sigs);
        assertEq(oracle.submittedCount(GRI_H100, SLOT), 0);
    }
}
