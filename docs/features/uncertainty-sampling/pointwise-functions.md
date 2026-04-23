# Sample-Aware Pointwise Numeric Functions

Pointwise numeric functions apply a numeric transform to one value at a time.
When any argument is uncertain, the function is evaluated independently for each
simulation trial and returns a `SampledDistribution`.

For example:

```text
A1 = N.CI(1, 2)
=SQRT(A1)
```

means:

```text
result[i] = SQRT(A1.samples[i])
```

The result is a sampled distribution for the transformed uncertain value.

## Implemented Functions

The supported pointwise functions are:

```text
ABS
SQRT
EXP
LN
LOG
LOG10
ROUND
ROUNDUP
ROUNDDOWN
INT
EVEN
ODD
CEILING
CEILING.MATH
CEILING.PRECISE
FLOOR
FLOOR.MATH
FLOOR.PRECISE
ACOS
ASIN
COS
SIN
TAN
ATAN
ATAN2
COT
SEC
CSC
SINH
COSH
TANH
COTH
SECH
CSCH
ACOT
ASINH
ACOSH
ATANH
ACOTH
SQRTPI
```

If all inputs are deterministic, these functions keep their existing scalar
behavior.

## Error Behavior

Sample-aware paths preserve the existing scalar error rules where possible.

- Non-finite sampled results return the existing `NUM` / `NaN` error.
- `LOG` still uses its existing argument validation for values and bases less
  than or equal to zero.
- `LN`, `LOG10`, and `SQRT` return the existing `NUM` / `NaN` error for invalid
  sampled values.

This completes the current Phase 3 pointwise function scope.
