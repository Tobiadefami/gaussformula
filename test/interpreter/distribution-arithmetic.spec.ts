import { ArithmeticHelper } from '../../src/interpreter/ArithmeticHelper'
import { Config } from '../../src/Config'
import { DateTimeHelper } from '../../src/DateTimeHelper'
import { NumberLiteralHelper } from '../../src/NumberLiteralHelper'
import { DistributionNumber, NumberType, SampledDistribution } from '../../src/interpreter/InterpreterValue'

function createHelper() {
  const config = new Config()
  const dt = new DateTimeHelper(config)
  const numLit = new NumberLiteralHelper(config)
  return new ArithmeticHelper(config, dt, numLit)
}

describe('Distribution arithmetic integration', () => {
  const helper = createHelper()

  it('multiplying two lognormal distributions returns SampledDistribution', () => {
    const ln1 = DistributionNumber.lognormal(0, 0.25)
    const ln2 = DistributionNumber.lognormal(1, 0.5)

    const result = helper.multiply(ln1, ln2)
    expect(result).toBeInstanceOf(SampledDistribution)
    expect((result as SampledDistribution).getSamples().length).toBe(Config.defaultConfig.sampleSize)
  })

  it('adding two uniform distributions returns SampledDistribution', () => {
    const u1 = DistributionNumber.uniform(0, 1)
    const u2 = DistributionNumber.uniform(-1, 2)
    const result = helper.addWithEpsilon(u1, u2)
    expect(result).toBeInstanceOf(SampledDistribution)
  })

  it('dividing a uniform distribution by a scalar produces SampledDistribution', () => {
    const u = DistributionNumber.uniform(2, 6)
    const result = helper.divide(u, 2)
    expect(result).toBeInstanceOf(SampledDistribution)
  })

  it('compares explicit distributions by representative value', () => {
    expect(helper.compare(DistributionNumber.normal(10, 4), 5)).toBe(1)
    expect(helper.compare(DistributionNumber.uniform(2, 4), 3)).toBe(0)
    expect(helper.compare(DistributionNumber.lognormal(0, 0), 2)).toBe(-1)
  })

  it('does not manufacture uncertainty wrappers from scalar values', () => {
    expect(() => helper.ExtendedNumberFactory(1, {type: NumberType.NUMBER_SAMPLED})).toThrow()
    expect(() => helper.ExtendedNumberFactory(1, {type: NumberType.NUMBER_DISTRIBUTION})).toThrow()
  })
})
