# Sample-Aware Aggregate Functions

Aggregate functions operate across cells. When any aggregate input is uncertain,
the aggregate should be evaluated once per simulation trial and should return a
`SampledDistribution`.

For example:

```text
A1 = N.CI(10, 20, 0.95)
A2 = N.CI(30, 40, 0.95)
=SUM(A1:A2)
```

means:

```text
result[i] = A1.samples[i] + A2.samples[i]
```

The result is a sampled distribution for the uncertain sum.

## Phase 1 Functions

The first supported aggregate functions are:

```text
SUM
AVERAGE
MIN
MAX
PRODUCT
SUMSQ
SUMPRODUCT
```

If all inputs are deterministic, these functions keep their existing scalar
behavior.

## Non-Goals For Phase 1

Phase 1 does not change `COUNT`, `COUNTA`, `COUNTBLANK`, conditional
aggregates, lookup functions, text functions, date functions, or conditionals.

Statistical aggregates such as `STDEV` and `VAR` are planned for the next
aggregate phase because they need separate tests for Excel-compatible error
behavior such as `STDEV(A1)` with a single observation.
