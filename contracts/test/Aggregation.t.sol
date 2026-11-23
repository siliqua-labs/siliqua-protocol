// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Aggregation} from "../src/Aggregation.sol";

contract AggregationHarness {
    function run(uint256[] memory values, uint16 tolerance, uint8 minValues)
        external
        pure
        returns (bool finalized, uint256 value, uint8 keptCount, uint256 center)
    {
        return Aggregation.aggregate(values, tolerance, minValues);
    }
}

/// Runs test-vectors/oracle-aggregation-v1.json, the same file the Python model is checked against.
contract AggregationTest is Test {
    AggregationHarness internal h = new AggregationHarness();

    function _json() internal view returns (string memory) {
        return vm.readFile("../test-vectors/oracle-aggregation-v1.json");
    }

    function test_sharedVectors() public {
        string memory json = _json();
        uint256 n = abi.decode(vm.parseJson(json, ".cases[*].name"), (string[])).length;
        assertEq(n, 15, "vector file changed: update this test deliberately");
        for (uint256 i; i < n; ++i) {
            _checkCase(json, string.concat(".cases[", vm.toString(i), "]"));
        }
    }

    function _checkCase(string memory json, string memory p) internal {
        string memory name = vm.parseJsonString(json, string.concat(p, ".name"));
        (bool finalized, uint256 value, uint8 keptCount, uint256 center) = h.run(
            vm.parseJsonUintArray(json, string.concat(p, ".values")),
            uint16(vm.parseJsonUint(json, string.concat(p, ".toleranceBps"))),
            uint8(vm.parseJsonUint(json, string.concat(p, ".minValues")))
        );
        assertEq(center, vm.parseJsonUint(json, string.concat(p, ".expected.median")), name);
        assertEq(keptCount, vm.parseJsonUintArray(json, string.concat(p, ".expected.kept")).length, name);
        // A null value means "not finalized"; forge cannot parse null as a number.
        if (_isNull(json, p)) {
            assertFalse(finalized, name);
        } else {
            assertTrue(finalized, name);
            assertEq(value, vm.parseJsonUint(json, string.concat(p, ".expected.value")), name);
        }
    }

    function _isNull(string memory json, string memory p) internal view returns (bool) {
        try this.parseUint(json, string.concat(p, ".expected.value")) returns (uint256) {
            return false;
        } catch {
            return true;
        }
    }

    function parseUint(string memory json, string memory key) external pure returns (uint256) {
        return vm.parseJsonUint(json, key);
    }

    function testFuzz_medianIsInsideTheRange(uint128 a, uint128 b, uint128 c, uint128 d, uint16 tol) public view {
        uint256[] memory v = new uint256[](4);
        v[0] = bound(a, 1, type(uint128).max);
        v[1] = bound(b, 1, type(uint128).max);
        v[2] = bound(c, 1, type(uint128).max);
        v[3] = bound(d, 1, type(uint128).max);
        (bool finalized, uint256 value, uint8 kept, uint256 center) = h.run(v, uint16(bound(tol, 0, 10_000)), 2);
        uint256 lo = type(uint256).max;
        uint256 hi;
        for (uint256 i; i < 4; ++i) {
            if (v[i] < lo) lo = v[i];
            if (v[i] > hi) hi = v[i];
        }
        assertGe(center, lo);
        assertLe(center, hi);
        assertEq(finalized, kept >= 2);
        if (finalized) {
            assertGe(value, lo);
            assertLe(value, hi);
        }
    }

    function testFuzz_orderDoesNotMatter(uint128 a, uint128 b, uint128 c) public view {
        uint256[] memory v1 = new uint256[](3);
        uint256[] memory v2 = new uint256[](3);
        v1[0] = bound(a, 1, type(uint128).max);
        v1[1] = bound(b, 1, type(uint128).max);
        v1[2] = bound(c, 1, type(uint128).max);
        v2[0] = v1[2];
        v2[1] = v1[0];
        v2[2] = v1[1];
        (bool f1, uint256 x1, uint8 k1,) = h.run(v1, 100, 2);
        (bool f2, uint256 x2, uint8 k2,) = h.run(v2, 100, 2);
        assertEq(f1, f2);
        assertEq(x1, x2);
        assertEq(k1, k2);
    }
}
