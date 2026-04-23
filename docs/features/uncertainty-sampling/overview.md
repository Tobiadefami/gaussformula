# Uncertainty Sampling

GaussFormula represents explicit uncertainty inputs with `DistributionNumber`
and arithmetic results with `SampledDistribution`.

The long-term goal is to make uncertainty propagate through spreadsheet
operations by Monte Carlo sampling where the operation has a clear
probabilistic meaning. Unsupported functions should not silently discard
uncertainty once they are reviewed.

See `phase-status.md` for implementation status, changed files, tests, and the
remaining work by phase.

Feature-specific behavior is documented in:

- `aggregate-functions.md`
- `comparisons-and-conditionals.md`
- `conditional-aggregates.md`
- `statistical-aggregate-functions.md`
- `pointwise-functions.md`
- `sampling-policies.md`

## Phases

1. Basic aggregate functions:
   `SUM`, `AVERAGE`, `MIN`, `MAX`, `PRODUCT`, `SUMSQ`, `SUMPRODUCT`.
2. Statistical aggregate functions:
   `STDEV`, `STDEV.S`, `STDEV.P`, `VAR`, `VAR.S`, `VAR.P`, `MEDIAN`,
   `LARGE`, `SMALL`, `GEOMEAN`, `HARMEAN`, `AVEDEV`, `DEVSQ`.
3. Pointwise numeric functions:
   `ABS`, `SQRT`, `EXP`, `LN`, `LOG`, `LOG10`, rounding functions,
   trigonometric functions, and related scalar numeric transforms.
4. Comparisons and conditionals:
   sampled comparison masks plus `IF`, `IFS`, `SWITCH`, `AND`, `OR`, `XOR`,
   `NOT`.
5. Conditional aggregates:
   `SUMIF`, `SUMIFS`, `AVERAGEIF`, `COUNTIF`, `COUNTIFS`, `MINIFS`,
   `MAXIFS`.

Each phase must add focused tests and update the relevant feature document.
