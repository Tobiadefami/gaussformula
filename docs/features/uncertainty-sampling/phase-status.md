# Uncertainty Sampling Phase Status

This file tracks the sampling-extension work across phases so progress is not
lost between implementation sessions.

## Current Status

Phases 1, 2, 3, and 4 are implemented.

Implemented behavior:

- `SUM`, `AVERAGE`, `MIN`, `MAX`, `PRODUCT`, and `SUMSQ` return
  `SampledDistribution` when any aggregate input is uncertain.
- `SUMPRODUCT` returns `SampledDistribution` when any range term is uncertain.
- Deterministic inputs keep the existing scalar behavior for the same functions.
- Uncertainty detection and sample extraction live in
  `src/interpreter/UncertaintyValue.ts` instead of `ArithmeticHelper`, so
  arithmetic and plugins can share the same definition of an uncertain value.
- Shared sample-aware aggregate helpers also live in
  `src/interpreter/UncertaintyValue.ts`, so plugins do not duplicate the
  per-simulation-trial loop or exact range value collection.
- `VAR.S`, `VAR.P`, `VAR`, `STDEV.S`, `STDEV.P`, `STDEV`, `MEDIAN`, `LARGE`,
  `SMALL`, `AVEDEV`, `DEVSQ`, `GEOMEAN`, and `HARMEAN` return
  `SampledDistribution` when any aggregate input is uncertain.
- `ABS`, `SQRT`, `EXP`, `LN`, `LOG`, and `LOG10` return
  `SampledDistribution` when any numeric argument is uncertain.
- Rounding, trigonometric, hyperbolic, inverse trigonometric, and `SQRTPI`
  functions in the Phase 3 scope return `SampledDistribution` when any numeric
  argument is uncertain.
- Comparison operators and `HF.EQ`, `HF.NE`, `HF.LT`, `HF.LTE`, `HF.GT`,
  `HF.GTE` return `SampledDistribution` when any compared operand is uncertain.
- `IF`, `IFS`, `AND`, `OR`, `XOR`, and `NOT` evaluate uncertain conditions per
  simulation trial and return `SampledDistribution` when they enter the sampled
  path.
- `SWITCH` evaluates uncertain selectors and match values per simulation trial
  and returns `SampledDistribution` when it enters the sampled path.

Primary implementation files:

- `src/interpreter/UncertaintyValue.ts`
- `src/interpreter/ArithmeticHelper.ts`
- `src/interpreter/plugin/NumericAggregationPlugin.ts`
- `src/interpreter/plugin/SumprodPlugin.ts`
- `src/interpreter/plugin/MedianPlugin.ts`
- `src/interpreter/plugin/StatisticalAggregationPlugin.ts`
- `src/interpreter/plugin/AbsPlugin.ts`
- `src/interpreter/plugin/SqrtPlugin.ts`
- `src/interpreter/plugin/ExpPlugin.ts`
- `src/interpreter/plugin/LogarithmPlugin.ts`
- `src/interpreter/plugin/RoundingPlugin.ts`
- `src/interpreter/plugin/TrigonometryPlugin.ts`
- `src/interpreter/plugin/MathConstantsPlugin.ts`
- `src/interpreter/Interpreter.ts`
- `src/interpreter/plugin/SimpleArithmertic.ts`
- `src/interpreter/plugin/BooleanPlugin.ts`

Primary tests:

- `test/interpreter/uncertainty-value.spec.ts`
- `test/interpreter/sample-aware-aggregates.spec.ts`
- `test/interpreter/sample-aware-statistical-aggregates.spec.ts`
- `test/interpreter/sample-aware-pointwise-functions.spec.ts`
- `test/interpreter/sample-aware-rounding-trigonometry.spec.ts`
- `test/interpreter/sample-aware-comparisons-and-conditionals.spec.ts`
- Existing aggregate and distribution tests for `SUM`, `AVERAGE`, `MIN`, `MAX`,
  `PRODUCT`, `SUMSQ`, `SUMPRODUCT`, distribution constructors, and distribution
  arithmetic.
- Existing statistical aggregate tests for `VAR.S`, `VAR.P`, `STDEV.S`,
  `STDEV.P`, `MEDIAN`, `LARGE`, `SMALL`, `AVEDEV`, `DEVSQ`, `GEOMEAN`, and
  `HARMEAN`.

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

Status: Implemented.

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

Implemented behavior:

- `VAR.S`, `VAR`, `STDEV.S`, and `STDEV` compute sample variance or sample
  standard deviation per simulation trial.
- `VAR.P` and `STDEV.P` compute population variance or population standard
  deviation per simulation trial.
- `MEDIAN`, `LARGE`, and `SMALL` rank values per simulation trial.
- `AVEDEV`, `DEVSQ`, `GEOMEAN`, and `HARMEAN` compute their statistic per
  simulation trial.
- Deterministic inputs keep the existing scalar behavior and existing
  Excel-compatible coercion rules.

Important design checks:

- Scalar behavior and error behavior are covered by the existing function tests.
- `STDEV.S` and `VAR.S` keep the existing single-observation `DIV_BY_ZERO`
  behavior.
- `MEDIAN`, `LARGE`, and `SMALL` only return sampled results when at least one
  input is uncertain; deterministic inputs remain scalar.

## Phase 3: Pointwise Numeric Functions

Status: Implemented.

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

Implemented behavior:

- `ABS`, `SQRT`, `EXP`, `LN`, `LOG`, `LOG10`, all Phase 3 rounding functions,
  all Phase 3 trigonometric and hyperbolic functions, and `SQRTPI` apply the
  numeric transform per simulation trial.
- `LOG`, `ATAN2`, and the multi-argument rounding functions support
  uncertainty in any numeric argument.
- Deterministic inputs keep existing scalar behavior.
- Non-finite sampled results return the existing `NUM` / `NaN` error.

Important design checks:

- Domain errors must be handled per function. For example, `SQRT` and `LN`
  cannot silently accept invalid samples.
- Functions with multiple numeric arguments need explicit alignment rules.

Remaining work:

- None for the current Phase 3 scope.

## Phase 4: Comparisons And Conditionals

Status: Implemented.

Candidate functions and operators:

- Comparison operators
- `IF`
- `IFS`
- `AND`
- `OR`
- `XOR`
- `NOT`
- `SWITCH`

Policy to implement:

Comparisons involving uncertainty need a sampled boolean result or equivalent
mask. Conditional functions should choose the true or false branch per
simulation trial.

Implemented behavior:

- Comparison operators evaluate per simulation trial and return sampled numeric
  masks of `1` and `0` when any operand is uncertain.
- `HF.EQ`, `HF.NE`, `HF.LT`, `HF.LTE`, `HF.GT`, and `HF.GTE` follow the same
  sampled comparison policy.
- `IF` and `IFS` evaluate uncertain conditions per simulation trial when their
  branch values can be coerced to numbers.
- `AND`, `OR`, `XOR`, and `NOT` evaluate uncertain logical arguments per
  simulation trial and return sampled numeric masks of `1` and `0`.
- `SWITCH` evaluates uncertain selectors and uncertain match values per
  simulation trial when its result values can be coerced to numbers.
- Deterministic inputs keep existing scalar behavior.

Important design checks:

- Sampled boolean masks are represented as `SampledDistribution` with `1` and
  `0`.
- Scalar comparison semantics in `ArithmeticHelper.compare()` stay unchanged in
  this phase so `SWITCH` and lookup-style behavior do not change accidentally.
- Sampled `IF`, `IFS`, and `SWITCH` currently support only result branches that
  can be coerced to numbers.

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
