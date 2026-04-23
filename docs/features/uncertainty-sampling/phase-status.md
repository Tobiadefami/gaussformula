# Uncertainty Sampling Phase Status

This file tracks the sampling-extension work across phases so progress is not
lost between implementation sessions.

## Current Status

Phase 1 is implemented.

Implemented behavior:

- `SUM`, `AVERAGE`, `MIN`, `MAX`, `PRODUCT`, and `SUMSQ` return
  `SampledDistribution` when any aggregate input is uncertain.
- `SUMPRODUCT` returns `SampledDistribution` when any range term is uncertain.
- Deterministic inputs keep the existing scalar behavior for the same functions.
- Uncertainty detection and sample extraction live in
  `src/interpreter/UncertaintyValue.ts` instead of `ArithmeticHelper`, so
  arithmetic and plugins can share the same definition of an uncertain value.

Primary implementation files:

- `src/interpreter/UncertaintyValue.ts`
- `src/interpreter/ArithmeticHelper.ts`
- `src/interpreter/plugin/NumericAggregationPlugin.ts`
- `src/interpreter/plugin/SumprodPlugin.ts`

Primary tests:

- `test/interpreter/uncertainty-value.spec.ts`
- `test/interpreter/sample-aware-aggregates.spec.ts`
- Existing aggregate and distribution tests for `SUM`, `AVERAGE`, `MIN`, `MAX`,
  `PRODUCT`, `SUMSQ`, `SUMPRODUCT`, distribution constructors, and distribution
  arithmetic.

## Phase 1: Basic Aggregates

Status: Implemented.

Functions:

- `SUM`
- `AVERAGE`
- `MIN`
- `MAX`
- `PRODUCT`
- `SUMSQ`
- `SUMPRODUCT`

Policy:

When any input is uncertain, each function aligns inputs by simulation trial and
returns a `SampledDistribution`. When all inputs are deterministic, behavior
stays scalar.

## Phase 2: Statistical Aggregates

Status: Not started.

Candidate functions:

- `STDEV`, `STDEV.S`, `STDEV.P`
- `VAR`, `VAR.S`, `VAR.P`
- `MEDIAN`
- `LARGE`
- `SMALL`
- `GEOMEAN`
- `HARMEAN`
- `AVEDEV`
- `DEVSQ`

Policy to implement:

Statistical aggregates over uncertain inputs should compute the statistic per
simulation trial and return a `SampledDistribution`.

Important design checks:

- Preserve existing Excel-compatible scalar behavior and error behavior.
- Confirm single-observation behavior before changing `STDEV` and `VAR`.
- Decide whether `MEDIAN`, `LARGE`, and `SMALL` should require at least one
  sampled input or should remain scalar for deterministic ranges.

## Phase 3: Pointwise Numeric Functions

Status: Not started.

Candidate functions:

- `ABS`
- `SQRT`
- `EXP`
- `LN`
- `LOG`
- `LOG10`
- Rounding functions
- Trigonometric functions
- Other scalar numeric transforms with one clear numeric output per input

Policy to implement:

When any argument is uncertain, apply the function to each sample and return a
`SampledDistribution`.

Important design checks:

- Domain errors must be handled per function. For example, `SQRT` and `LN`
  cannot silently accept invalid samples.
- Functions with multiple numeric arguments need explicit alignment rules.

## Phase 4: Comparisons And Conditionals

Status: Not started.

Candidate functions and operators:

- Comparison operators
- `IF`
- `IFS`
- `SWITCH`
- `AND`
- `OR`
- `XOR`
- `NOT`

Policy to implement:

Comparisons involving uncertainty need a sampled boolean result or equivalent
mask. Conditional functions should choose the true or false branch per
simulation trial.

Important design checks:

- Decide the internal representation for sampled boolean masks.
- Prevent conditionals from collapsing uncertain comparisons to representative
  values.
- Define how mixed scalar and sampled branches align.

## Phase 5: Conditional Aggregates And Filtering

Status: Not started.

Candidate functions:

- `SUMIF`
- `SUMIFS`
- `AVERAGEIF`
- `COUNTIF`
- `COUNTIFS`
- `MINIFS`
- `MAXIFS`
- `FILTER`

Policy to implement:

Conditional aggregate and filtering functions should use sampled conditions when
the criteria or tested values are uncertain.

Important design checks:

- This phase likely depends on Phase 4 sampled comparison masks.
- `COUNT*` functions may return sampled counts when uncertainty affects whether
  a value matches.
- Criteria parsing should not be duplicated; reuse existing criteria logic where
  possible.

## Before Starting A New Phase

For each phase:

1. Add focused failing tests for the target functions.
2. Implement only the target function family.
3. Verify deterministic behavior still matches existing scalar behavior.
4. Update this file with the implemented behavior, changed files, and tests.
5. Update the feature-specific document when the sampling policy changes.
