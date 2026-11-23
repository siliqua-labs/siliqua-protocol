// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

interface ISiliquaOracle {
    struct Report {
        bytes32 indexId;
        uint64 timestamp;
        uint256 value;
        uint8 sources;
        uint32 methodologyVersion;
        uint256 nonce;
    }

    struct IndexConfig {
        bool registered;
        uint32 period;
        uint8 decimals;
        uint8 minSources;
        uint16 toleranceBps;
    }

    function submit(Report[] calldata reports, bytes[] calldata signatures) external;

    function getSlot(bytes32 indexId, uint64 timestamp)
        external
        view
        returns (
            bool finalized,
            uint256 value,
            uint8 sources,
            uint32 methodologyVersion,
            uint64 finalizedAt,
            uint8 keptCount
        );

    function latest(bytes32 indexId) external view returns (uint64 timestamp, uint256 value);

    /// Mean of the finalized slots in [from, to), rounded half up. `staleSlots` counts slots that
    /// are not finalized; the caller decides how much staleness it tolerates.
    function twap(bytes32 indexId, uint64 from, uint64 to)
        external
        view
        returns (uint256 value, uint32 usedSlots, uint32 staleSlots);

    function indexConfig(bytes32 indexId) external view returns (IndexConfig memory);

    function isOperator(address account) external view returns (bool);
}
