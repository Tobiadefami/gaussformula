# Sampling Policies

Sampling behavior must be explicit per function family.

## Aggregate

Aggregate functions reduce values across cells. When any input is uncertain,
they align all inputs by simulation trial and reduce each trial independently.

Examples: `SUM`, `AVERAGE`, `MIN`, `MAX`, `PRODUCT`, `SUMSQ`, `SUMPRODUCT`.

## Pointwise

Pointwise numeric functions apply one deterministic numeric transform to each
sample when any argument is uncertain.

Examples: `ABS`, `SQRT`, `EXP`, `ROUND`, `SIN`.

## Conditional

Conditional functions require sampled boolean masks. A comparison involving an
uncertain value should produce a mask, and `IF` should choose the true or false
branch per simulation trial.

Examples: comparisons, `IF`, `IFS`, `SWITCH`.

## Unsupported

Functions without a documented sampling policy should keep their current
behavior until reviewed. Later phases should prevent silent uncertainty loss for
functions that cannot safely use representative values.
