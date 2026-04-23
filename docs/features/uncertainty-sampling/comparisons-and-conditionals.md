# Sample-Aware Comparisons And Conditionals

Phase 4 introduces sampled comparison masks and sampled logical evaluation.

## Implemented behavior

- Comparison operators return `SampledDistribution` when either operand is
  uncertain:
  - `=`
  - `<>`
  - `<`
  - `<=`
  - `>`
  - `>=`
- Internal comparison functions return `SampledDistribution` when either
  operand is uncertain:
  - `HF.EQ`
  - `HF.NE`
  - `HF.LT`
  - `HF.LTE`
  - `HF.GT`
  - `HF.GTE`
- `IF` and `IFS` evaluate their conditions per simulation trial when any
  condition is uncertain.
- `AND`, `OR`, `XOR`, and `NOT` evaluate logical results per simulation trial
  when any argument is uncertain.

## Representation

- Sampled boolean results are represented as `SampledDistribution` with
  `1` for true and `0` for false.
- This keeps sampled comparisons compatible with later numeric operations and
  with the existing uncertainty value model.

## Current Phase 4 boundary

- `IF` and `IFS` sampled paths currently require branch values that can be
  coerced to numbers.
- Non-numeric sampled branches return the existing number-coercion `VALUE`
  error.
- `SWITCH` is not sample-aware yet.
- Lookup-style and criteria-style boolean flows are still deferred to Phase 5.

## Design notes

- Deterministic comparisons and boolean functions keep their existing scalar
  behavior.
- Sample alignment lives in `src/interpreter/UncertaintyValue.ts`.
- Scalar comparison semantics in `ArithmeticHelper.compare()` were left alone
  for this phase so lookup and switch behavior does not change accidentally.
