// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {OracleBase} from "./Base.sol";
import {GpuRentConsumer} from "../src/examples/GpuRentConsumer.sol";
import {ISiliquaOracle} from "../src/interfaces/ISiliquaOracle.sol";

contract GpuRentConsumerTest is OracleBase {
    uint64 internal constant SLOT = 1_795_420_800;
    GpuRentConsumer internal consumer;

    function setUp() public override {
        super.setUp();
        consumer = new GpuRentConsumer(ISiliquaOracle(address(oracle)), GRI_H100, 1 hours);
    }

    function test_revertsBeforeAnythingIsPublished() public {
        vm.expectRevert(GpuRentConsumer.NoValue.selector);
        consumer.price();
    }

    function test_returnsTheLatestFinalizedValue() public {
        vm.warp(uint256(SLOT) + 1 hours);
        submitSlot(GRI_H100, SLOT, values2(3_520_000, 3_524_000));
        (uint256 value, uint64 slotStart) = consumer.price();
        assertEq(value, 3_522_000);
        assertEq(slotStart, SLOT);
    }

    function test_revertsInsteadOfReturningAnOldValue() public {
        vm.warp(uint256(SLOT) + 1 hours);
        submitSlot(GRI_H100, SLOT, values2(3_520_000, 3_524_000));
        vm.warp(uint256(SLOT) + 1 hours + 1 hours);
        consumer.price();
        vm.warp(uint256(SLOT) + 1 hours + 1 hours + 1);
        vm.expectRevert(abi.encodeWithSelector(GpuRentConsumer.Stale.selector, SLOT + 1 hours, 1 hours));
        consumer.price();
    }

    function test_averageReportsTheMissingHours() public {
        vm.warp(uint256(SLOT) + 1 hours);
        submitSlot(GRI_H100, SLOT, values2(3_000_000, 3_000_000));
        (uint256 value, uint32 stale) = consumer.averagePrice(SLOT, SLOT + 3 hours);
        assertEq(value, 3_000_000);
        assertEq(stale, 2);
        vm.expectRevert(GpuRentConsumer.NoValue.selector);
        consumer.averagePrice(SLOT + 1 hours, SLOT + 3 hours);
    }
}
