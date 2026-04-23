# Sample-Aware Statistical Aggregate Functions

Statistical aggregate functions operate across a set of values. When any input
is uncertain, the function is evaluated independently for each simulation trial
and returns a `SampledDistribution`.

For example:

```text
A1 = N.CI(10, 20)
A2 = N.CI(30, 40)
=STDEV.S(A1:A2)
```

means:

```text
result[i] = STDEV.S(A1.samples[i], A2.samples[i])
```

The result is a sampled distribution for the uncertain statistic.

## Phase 2 Functions

The supported statistical aggregate functions are:

```text
VAR
VAR.S
VAR.P
STDEV
STDEV.S
STDEV.P
MEDIAN
LARGE
SMALL
AVEDEV
DEVSQ
GEOMEAN
HARMEAN
```

`VAR` and `STDEV` use the existing aliases for `VAR.S` and `STDEV.S`.

If all inputs are deterministic, these functions keep their existing scalar
behavior.

## Error Behavior

Sample-aware paths preserve the existing scalar error rules where possible.

- `VAR.S` and `STDEV.S` require at least two values.
- `VAR.P` and `STDEV.P` require at least one value.
- `MEDIAN`, `GEOMEAN`, and `HARMEAN` require at least one value.
- `LARGE` and `SMALL` return the existing `NUM` error when the requested rank
  is outside the available value count.
- `GEOMEAN` and `HARMEAN` return the existing `NUM` error when a sampled value
  is less than or equal to zero.

## Non-Goals For Phase 2

Phase 2 does not change conditional aggregates, lookup functions, text
functions, date functions, pointwise numeric functions, or conditionals.
