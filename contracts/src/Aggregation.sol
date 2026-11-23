// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// Median and outlier drop of docs/spec/oracle-v1.md section 7. Integer arithmetic only.
/// The caller guarantees every value is below 2**128 (SiliquaOracle enforces it on submit),
/// so `|x - m| * BPS` and the sum of two values cannot overflow.
library Aggregation {
    uint256 internal constant BPS = 10_000;

    /// `sorted` must be in ascending order and not empty.
    function median(uint256[] memory sorted) internal pure returns (uint256) {
        uint256 n = sorted.length;
        if (n % 2 == 1) return sorted[n / 2];
        // Mean of the two middle values, rounded half up.
        return (sorted[n / 2 - 1] + sorted[n / 2] + 1) / 2;
    }

    /// Returns the slot value, the number of kept values and whether the slot is finalized.
    /// A value on the tolerance bound is kept: the drop test is strict.
    function aggregate(uint256[] memory values, uint16 toleranceBps, uint8 minValues)
        internal
        pure
        returns (bool finalized, uint256 value, uint8 keptCount, uint256 center)
    {
        uint256 n = values.length;
        sort(values);
        center = median(values);

        uint256[] memory kept = new uint256[](n);
        uint256 k;
        for (uint256 i; i < n; ++i) {
            uint256 x = values[i];
            uint256 distance = x > center ? x - center : center - x;
            if (distance * BPS <= center * toleranceBps) kept[k++] = x;
        }
        keptCount = uint8(k);
        if (k < minValues) return (false, 0, keptCount, center);

        // `kept` is sorted because `values` is; shrink it to its real length.
        assembly {
            mstore(kept, k)
        }
        return (true, median(kept), keptCount, center);
    }

    /// Insertion sort: n is the number of operators, at most 15.
    function sort(uint256[] memory a) internal pure {
        for (uint256 i = 1; i < a.length; ++i) {
            uint256 key = a[i];
            uint256 j = i;
            while (j > 0 && a[j - 1] > key) {
                a[j] = a[j - 1];
                --j;
            }
            a[j] = key;
        }
    }
}
