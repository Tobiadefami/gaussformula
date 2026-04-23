import {Config} from '../../src/Config'
import {
  collectExactUncertaintyValues,
  isUncertainValue,
  sampleAwareAggregate,
  samplesForValue,
} from '../../src/interpreter/UncertaintyValue'
import {DistributionNumber, SampledDistribution} from '../../src/interpreter/InterpreterValue'
import {SimpleRangeValue} from '../../src/SimpleRangeValue'

describe('uncertainty values', () => {
  const config = new Config()

  it('identifies distribution-backed values as uncertain', () => {
    expect(isUncertainValue(DistributionNumber.normal(10, 0))).toBe(true)
    expect(isUncertainValue(new SampledDistribution([1, 2, 3], config))).toBe(true)
    expect(isUncertainValue(10)).toBe(false)
  })

  it('converts scalars, input distributions, and sampled results to samples', () => {
    expect(samplesForValue(5, config)).toEqual(Array(config.sampleSize).fill(5))
    expect(samplesForValue(new SampledDistribution([1, 2, 3], config), config)).toEqual([1, 2, 3])
    expect(samplesForValue(DistributionNumber.normal(10, 0), config)).toEqual(Array(config.sampleSize).fill(10))
  })

  it('evaluates aggregate logic once per sample when any value is uncertain', () => {
    const result = sampleAwareAggregate([
      new SampledDistribution([1, 2, 3], config),
      10,
    ], config, (values) => values.reduce((sum, value) => sum + value, 0))

    expect(result).toBeInstanceOf(SampledDistribution)
    expect((result as SampledDistribution).getSamples()).toHaveLength(config.sampleSize)
    expect((result as SampledDistribution).getSamples().slice(0, 6)).toEqual([11, 12, 13, 11, 12, 13])
  })

  it('returns undefined for sample-aware aggregate logic when all values are deterministic', () => {
    expect(sampleAwareAggregate([1, 2], config, (values) => values[0] + values[1])).toBeUndefined()
  })

  it('collects exact uncertainty values from scalar arguments and ranges', () => {
    const distribution = DistributionNumber.normal(10, 0)
    const values = collectExactUncertaintyValues([
      distribution,
      SimpleRangeValue.onlyValues([[1, distribution]]),
    ], (arg) => arg as number | DistributionNumber)

    expect(values).toEqual([distribution, 1, distribution])
  })
})
