// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "./interfaces/IERC20.sol";
import {SafeToken} from "./SafeToken.sol";

/// Splits whatever token it holds to three fixed addresses: 50% buyback and burn, 30% treasury,
/// 20% oracle operators. It never swaps and never burns: the buyback address is a wallet the
/// treasury operates, which is a trust assumption (docs/PLAN.md section 2.1). A router is
/// immutable; changing a recipient means a new router and a new factory template.
contract FeeRouter {
    using SafeToken for IERC20;

    uint256 public constant BUYBACK_BPS = 5_000;
    uint256 public constant TREASURY_BPS = 3_000;
    uint256 private constant BPS = 10_000;

    address public immutable buyback;
    address public immutable treasury;
    address public immutable operators;

    event Distributed(address indexed token, uint256 buybackAmount, uint256 treasuryAmount, uint256 operatorsAmount);

    error ZeroAddress();
    error NothingToDistribute();

    constructor(address buyback_, address treasury_, address operators_) {
        if (buyback_ == address(0) || treasury_ == address(0) || operators_ == address(0)) revert ZeroAddress();
        buyback = buyback_;
        treasury = treasury_;
        operators = operators_;
    }

    /// Anyone may call. Rounding dust goes to the operators share so the split always adds up.
    function distribute(IERC20 token) external {
        uint256 balance = token.balanceOf(address(this));
        if (balance == 0) revert NothingToDistribute();
        uint256 toBuyback = balance * BUYBACK_BPS / BPS;
        uint256 toTreasury = balance * TREASURY_BPS / BPS;
        uint256 toOperators = balance - toBuyback - toTreasury;
        emit Distributed(address(token), toBuyback, toTreasury, toOperators);
        if (toBuyback != 0) token.safeTransfer(buyback, toBuyback);
        if (toTreasury != 0) token.safeTransfer(treasury, toTreasury);
        if (toOperators != 0) token.safeTransfer(operators, toOperators);
    }
}
