# Sample-Aware Conditional Aggregates

Phase 5 starts with criterion aggregate functions.

## Implemented behavior

- `COUNTIF`
- `COUNTIFS`
- `SUMIF`
- `SUMIFS`
- `AVERAGEIF`
- `MINIFS`
- `MAXIFS`

When any tested range, aggregated range, or scalar criterion is uncertain, these
functions evaluate the criteria per simulation trial and return
`SampledDistribution`.

## Current policy

- Deterministic inputs keep the existing scalar path and existing criterion
  caches.
- The sampled path reuses the existing criterion parser and criterion lambdas.
- The sampled path does not use the current scalar criterion cache, because that
  cache is keyed for scalar criteria and scalar range values.
- Counts are returned as sampled numeric counts.
- `SUMIF`, `SUMIFS`, `AVERAGEIF`, `MINIFS`, and `MAXIFS` return sampled numeric
  results.

## Current boundary

- `FILTER` is still deferred.
- Sampled conditional aggregates remain numeric-only.
- Criteria parsing still follows the existing scalar criterion rules; the new
  behavior is that an uncertain scalar criterion is sampled and parsed per
  trial.
