def div_half_up(numerator: int, denominator: int) -> int:
    """Integer division rounding half up. Index values are never negative."""
    if numerator < 0 or denominator <= 0:
        raise ValueError(
            f"div_half_up needs numerator >= 0 and denominator > 0, got {numerator}/{denominator}"
        )
    return (2 * numerator + denominator) // (2 * denominator)
