import {Config} from '../../src/Config'
import {isUncertainValue, samplesForValue} from '../../src/interpreter/UncertaintyValue'
import {DistributionNumber, SampledDistribution} from '../../src/interpreter/InterpreterValue'

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
})
