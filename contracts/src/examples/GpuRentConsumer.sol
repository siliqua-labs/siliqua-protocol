// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {ISiliquaOracle} from "../interfaces/ISiliquaOracle.sol";

/// Read-only example for projects that want a GPU rent index as a price reference (roadmap 3.7).
/// It holds no funds and has no admin. Copy it and adapt the staleness rule to your use.
contract GpuRentConsumer {
    ISiliquaOracle public immutable oracle;
    bytes32 public immutable indexId;
    // How long after its slot ended a value may still be used, on top of the oracle's own late window.
    uint64 public immutable maxAge;

    error NoValue();
    error Stale(uint64 slotEnd, uint64 maxAge);

    constructor(ISiliquaOracle oracle_, bytes32 indexId_, uint64 maxAge_) {
        oracle = oracle_;
        indexId = indexId_;
        maxAge = maxAge_;
    }

    /// Latest finalized value in the index decimals (micro-USD per GPU-hour for GRI) and the start
    /// of the slot it describes. Reverts instead of returning an old number.
    function price() public view returns (uint256 value, uint64 slotStart) {
        (slotStart, value) = oracle.latest(indexId);
        if (value == 0) revert NoValue();
        uint64 slotEnd = slotStart + oracle.indexConfig(indexId).period;
        if (block.timestamp > uint256(slotEnd) + maxAge) revert Stale(slotEnd, maxAge);
    }

    /// Mean of the finalized hours in [from, to) and how many hours were missing. The caller decides
    /// how many missing hours it can live with; a market voids above 6.
    function averagePrice(uint64 from, uint64 to) external view returns (uint256 value, uint32 staleSlots) {
        uint32 used;
        (value, used, staleSlots) = oracle.twap(indexId, from, to);
        if (used == 0) revert NoValue();
    }
}
