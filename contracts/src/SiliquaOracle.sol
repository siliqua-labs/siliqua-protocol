// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {ISiliquaOracle} from "./interfaces/ISiliquaOracle.sol";
import {Aggregation} from "./Aggregation.sol";

/// Stores index values reported by an allowlist of operators. Specification:
/// docs/spec/oracle-v1.md. Plain contract, no proxy: a new version is a new deployment listed in
/// OracleRegistry. There is no function that rewrites or deletes a finalized value.
contract SiliquaOracle is ISiliquaOracle {
    enum Reason {
        UnknownIndex,
        BadTimestamp,
        WindowClosed,
        WindowNotOpen,
        UnknownSigner,
        ValueOutOfRange,
        BadMethodology,
        TooFewSources,
        DuplicateOperator,
        NonceUsed
    }

    struct Observation {
        address operator;
        uint8 sources;
        uint256 value;
    }

    struct Slot {
        bool finalized;
        uint8 sources;
        uint8 keptCount;
        uint32 methodologyVersion;
        uint64 finalizedAt;
        uint256 value;
        Observation[] observations;
    }

    uint64 public constant LATE_WINDOW = 3 hours;
    uint64 public constant METHODOLOGY_NOTICE = 14 days;
    uint8 public constant MAX_OPERATORS = 15;
    uint32 public constant MAX_TWAP_SLOTS = 168;
    uint256 public constant MAX_VALUE = type(uint128).max;

    bytes32 public constant REPORT_TYPEHASH = keccak256(
        "Report(bytes32 indexId,uint64 timestamp,uint256 value,uint8 sources,uint32 methodologyVersion,uint256 nonce)"
    );
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    // Upper half of the secp256k1 order: a signature with a larger s is the malleable twin.
    uint256 private constant HALF_ORDER = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    address public admin;
    address public guardian;
    uint8 public minValues;
    uint8 public operatorCount;

    mapping(address => bool) public isOperator;
    mapping(bytes32 => IndexConfig) private _indexes;
    mapping(uint32 => bool) public methodologyRegistered;
    mapping(uint32 => uint64) public methodologyEffectiveFrom;
    mapping(address => mapping(uint256 => uint256)) public nonceBitmap;
    mapping(bytes32 => mapping(uint64 => Slot)) private _slots;
    mapping(bytes32 => uint64) private _latestTimestamp;

    event OperatorAdded(address operator);
    event OperatorRemoved(address operator);
    event IndexRegistered(bytes32 indexId, uint32 period, uint8 decimals, uint8 minSources, uint16 toleranceBps);
    event IndexParamsChanged(bytes32 indexId, uint8 minSources, uint16 toleranceBps);
    event MethodologyRegistered(uint32 methodologyVersion, uint64 effectiveFrom);
    event MinValuesChanged(uint8 minValues);
    event AdminChanged(address admin);
    event GuardianChanged(address guardian);
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
    event ReportRejected(bytes32 indexed indexId, uint64 indexed timestamp, address operator, uint8 reason);
    event SlotFinalized(
        bytes32 indexed indexId,
        uint64 indexed timestamp,
        uint256 value,
        uint8 keptCount,
        uint8 submittedCount,
        uint32 methodologyVersion
    );

    error NotAdmin();
    error NotAdminOrGuardian();
    error ZeroAddress();
    error LengthMismatch();
    error OperatorExists();
    error OperatorMissing();
    error TooManyOperators();
    error IndexExists();
    error IndexMissing();
    error BadIndexParams();
    error MethodologyExists();
    error MethodologyTooSoon();
    error BadMinValues();
    error BadTwapRange();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    /// `admin` is expected to be a timelock owned by the multisig, `guardian` the multisig itself
    /// (it may only remove an operator). The first methodology is effective immediately.
    constructor(address admin_, address guardian_, uint8 minValues_, uint32 firstMethodologyVersion) {
        if (admin_ == address(0) || guardian_ == address(0)) revert ZeroAddress();
        if (minValues_ < 2) revert BadMinValues();
        admin = admin_;
        guardian = guardian_;
        minValues = minValues_;
        methodologyRegistered[firstMethodologyVersion] = true;
        emit MethodologyRegistered(firstMethodologyVersion, 0);
    }

    // ------------------------------------------------------------------ administration

    function addOperator(address operator) external onlyAdmin {
        if (operator == address(0)) revert ZeroAddress();
        if (isOperator[operator]) revert OperatorExists();
        if (operatorCount >= MAX_OPERATORS) revert TooManyOperators();
        isOperator[operator] = true;
        ++operatorCount;
        emit OperatorAdded(operator);
    }

    /// Removing an operator does not touch slots already reported.
    function removeOperator(address operator) external {
        if (msg.sender != admin && msg.sender != guardian) revert NotAdminOrGuardian();
        if (!isOperator[operator]) revert OperatorMissing();
        isOperator[operator] = false;
        --operatorCount;
        emit OperatorRemoved(operator);
    }

    function registerIndex(bytes32 indexId, uint32 period, uint8 decimals, uint8 minSources, uint16 toleranceBps)
        external
        onlyAdmin
    {
        if (_indexes[indexId].registered) revert IndexExists();
        if (period == 0 || toleranceBps > 10_000) revert BadIndexParams();
        _indexes[indexId] = IndexConfig(true, period, decimals, minSources, toleranceBps);
        emit IndexRegistered(indexId, period, decimals, minSources, toleranceBps);
    }

    function setIndexParams(bytes32 indexId, uint8 minSources, uint16 toleranceBps) external onlyAdmin {
        IndexConfig storage cfg = _indexes[indexId];
        if (!cfg.registered) revert IndexMissing();
        if (toleranceBps > 10_000) revert BadIndexParams();
        cfg.minSources = minSources;
        cfg.toleranceBps = toleranceBps;
        emit IndexParamsChanged(indexId, minSources, toleranceBps);
    }

    /// A new methodology takes effect at least 14 days after it is announced here.
    function registerMethodology(uint32 methodologyVersion, uint64 effectiveFrom) external onlyAdmin {
        if (methodologyRegistered[methodologyVersion]) revert MethodologyExists();
        if (effectiveFrom < block.timestamp + METHODOLOGY_NOTICE) revert MethodologyTooSoon();
        methodologyRegistered[methodologyVersion] = true;
        methodologyEffectiveFrom[methodologyVersion] = effectiveFrom;
        emit MethodologyRegistered(methodologyVersion, effectiveFrom);
    }

    function setMinValues(uint8 minValues_) external onlyAdmin {
        if (minValues_ < 2) revert BadMinValues();
        minValues = minValues_;
        emit MinValuesChanged(minValues_);
    }

    function setGuardian(address guardian_) external onlyAdmin {
        if (guardian_ == address(0)) revert ZeroAddress();
        guardian = guardian_;
        emit GuardianChanged(guardian_);
    }

    function transferAdmin(address admin_) external onlyAdmin {
        if (admin_ == address(0)) revert ZeroAddress();
        admin = admin_;
        emit AdminChanged(admin_);
    }

    // ------------------------------------------------------------------ submission

    /// Anyone may relay: each report carries its operator's signature. A report that fails a check
    /// is skipped with ReportRejected so it cannot block the others. A slot is finalized at the end
    /// of the batch, over every value stored for it, so the order inside a batch does not matter.
    function submit(Report[] calldata reports, bytes[] calldata signatures) external {
        if (reports.length != signatures.length) revert LengthMismatch();
        for (uint256 i; i < reports.length; ++i) {
            _process(reports[i], signatures[i]);
        }
        for (uint256 i; i < reports.length; ++i) {
            _finalizeIfReady(reports[i].indexId, reports[i].timestamp);
        }
    }

    function _process(Report calldata r, bytes calldata signature) private {
        IndexConfig memory cfg = _indexes[r.indexId];
        if (!cfg.registered) return _reject(r, address(0), Reason.UnknownIndex);
        if (r.timestamp % cfg.period != 0) return _reject(r, address(0), Reason.BadTimestamp);
        if (r.value == 0 || r.value > MAX_VALUE) return _reject(r, address(0), Reason.ValueOutOfRange);

        uint256 opens = uint256(r.timestamp) + cfg.period;
        if (block.timestamp < opens) return _reject(r, address(0), Reason.WindowNotOpen);
        if (block.timestamp > opens + LATE_WINDOW) return _reject(r, address(0), Reason.WindowClosed);

        address operator = _recover(hashReport(r), signature);
        if (operator == address(0) || !isOperator[operator]) return _reject(r, operator, Reason.UnknownSigner);

        Slot storage slot = _slots[r.indexId][r.timestamp];
        if (!_methodologyAllowed(r, slot)) return _reject(r, operator, Reason.BadMethodology);
        if (r.sources < cfg.minSources) return _reject(r, operator, Reason.TooFewSources);
        if (_hasReported(slot, operator)) return _reject(r, operator, Reason.DuplicateOperator);

        uint256 word = r.nonce >> 8;
        uint256 bit = 1 << (r.nonce & 0xff);
        if (nonceBitmap[operator][word] & bit != 0) return _reject(r, operator, Reason.NonceUsed);
        nonceBitmap[operator][word] |= bit;

        if (slot.observations.length == 0) slot.methodologyVersion = r.methodologyVersion;
        slot.observations.push(Observation(operator, r.sources, r.value));
        emit OperatorValue(
            r.indexId, r.timestamp, operator, r.value, r.sources, r.methodologyVersion, r.nonce, !slot.finalized
        );
    }

    function _methodologyAllowed(Report calldata r, Slot storage slot) private view returns (bool) {
        if (!methodologyRegistered[r.methodologyVersion]) return false;
        if (r.timestamp < methodologyEffectiveFrom[r.methodologyVersion]) return false;
        return slot.observations.length == 0 || slot.methodologyVersion == r.methodologyVersion;
    }

    function _hasReported(Slot storage slot, address operator) private view returns (bool) {
        uint256 n = slot.observations.length;
        for (uint256 i; i < n; ++i) {
            if (slot.observations[i].operator == operator) return true;
        }
        return false;
    }

    function _reject(Report calldata r, address operator, Reason reason) private {
        emit ReportRejected(r.indexId, r.timestamp, operator, uint8(reason));
    }

    function _finalizeIfReady(bytes32 indexId, uint64 timestamp) private {
        Slot storage slot = _slots[indexId][timestamp];
        uint256 n = slot.observations.length;
        if (slot.finalized || n < minValues) return;

        uint256[] memory values = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            values[i] = slot.observations[i].value;
        }
        IndexConfig memory cfg = _indexes[indexId];
        (bool finalized, uint256 value, uint8 keptCount, uint256 center) =
            Aggregation.aggregate(values, cfg.toleranceBps, minValues);
        if (!finalized) return;

        // The slot reports the weakest evidence among the values it kept.
        uint8 sources = type(uint8).max;
        for (uint256 i; i < n; ++i) {
            Observation storage o = slot.observations[i];
            uint256 distance = o.value > center ? o.value - center : center - o.value;
            if (distance * Aggregation.BPS <= center * cfg.toleranceBps && o.sources < sources) sources = o.sources;
        }

        slot.finalized = true;
        slot.value = value;
        slot.sources = sources;
        slot.keptCount = keptCount;
        slot.finalizedAt = uint64(block.timestamp);
        if (timestamp > _latestTimestamp[indexId]) _latestTimestamp[indexId] = timestamp;
        emit SlotFinalized(indexId, timestamp, value, keptCount, uint8(n), slot.methodologyVersion);
    }

    // ------------------------------------------------------------------ signatures

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256("SiliquaOracle"), keccak256("1"), block.chainid, address(this))
        );
    }

    function hashReport(Report calldata r) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(REPORT_TYPEHASH, r.indexId, r.timestamp, r.value, r.sources, r.methodologyVersion, r.nonce)
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    /// Zero address for anything but a canonical 65-byte signature.
    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address) {
        if (signature.length != 65) return address(0);
        bytes32 r = bytes32(signature[0:32]);
        bytes32 s = bytes32(signature[32:64]);
        uint8 v = uint8(signature[64]);
        if (v != 27 && v != 28) return address(0);
        if (uint256(s) > HALF_ORDER) return address(0);
        return ecrecover(digest, v, r, s);
    }

    // ------------------------------------------------------------------ reads

    function indexConfig(bytes32 indexId) external view returns (IndexConfig memory) {
        return _indexes[indexId];
    }

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
        )
    {
        Slot storage s = _slots[indexId][timestamp];
        return (s.finalized, s.value, s.sources, s.methodologyVersion, s.finalizedAt, s.keptCount);
    }

    function submittedCount(bytes32 indexId, uint64 timestamp) external view returns (uint256) {
        return _slots[indexId][timestamp].observations.length;
    }

    function latest(bytes32 indexId) external view returns (uint64 timestamp, uint256 value) {
        timestamp = _latestTimestamp[indexId];
        value = _slots[indexId][timestamp].value;
    }

    function twap(bytes32 indexId, uint64 from, uint64 to)
        external
        view
        returns (uint256 value, uint32 usedSlots, uint32 staleSlots)
    {
        IndexConfig memory cfg = _indexes[indexId];
        if (!cfg.registered) revert IndexMissing();
        if (from >= to || from % cfg.period != 0 || to % cfg.period != 0 || (to - from) / cfg.period > MAX_TWAP_SLOTS) {
            revert BadTwapRange();
        }

        uint256 sum = 0;
        for (uint64 t = from; t < to; t += cfg.period) {
            Slot storage s = _slots[indexId][t];
            if (s.finalized) {
                sum += s.value;
                ++usedSlots;
            } else {
                ++staleSlots;
            }
        }
        // Mean rounded half up: floor(sum / used + 1/2).
        if (usedSlots != 0) value = (2 * sum + usedSlots) / (2 * uint256(usedSlots));
    }
}
