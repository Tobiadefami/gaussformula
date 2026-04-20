import { ArithmeticHelper } from '../../src/interpreter/ArithmeticHelper'
import { Config } from '../../src/Config'
import { DateTimeHelper } from '../../src/DateTimeHelper'
import { NumberLiteralHelper } from '../../src/NumberLiteralHelper'
import { ConfidenceIntervalNumber, SampledDistribution } from '../../src/interpreter/InterpreterValue'

function createHelper() {
  const config = new Config()
  const dt = new DateTimeHelper(config)
  const numLit = new NumberLiteralHelper(config)
  return new ArithmeticHelper(config, dt, numLit)
}

describe('Distribution arithmetic integration', () => {
  const helper = createHelper()

  it('multiplying two lognormal confidence intervals returns SampledDistribution', () => {
    const ln1 = new ConfidenceIntervalNumber(1, 3, 90, { interpretation: 'lognormal' })
    const ln2 = new ConfidenceIntervalNumber(2, 5, 90, { interpretation: 'lognormal' })

    const result = helper.multiply(ln1, ln2)
    expect(result).toBeInstanceOf(SampledDistribution)
    expect((result as SampledDistribution).getSamples().length).toBe(Config.defaultConfig.sampleSize)
  })

  it('adding two uniform confidence intervals returns SampledDistribution', () => {
    const u1 = new ConfidenceIntervalNumber(0, 1, 90, { interpretation: 'uniform' })
    const u2 = new ConfidenceIntervalNumber(-1, 2, 90, { interpretation: 'uniform' })
    const result = helper.addWithEpsilon(u1, u2)
    expect(result).toBeInstanceOf(SampledDistribution)
  })

  it('dividing a uniform confidence interval by a scalar produces SampledDistribution', () => {
    const u = new ConfidenceIntervalNumber(2, 6, 90, { interpretation: 'uniform' })
    const result = helper.divide(u, 2)
    expect(result).toBeInstanceOf(SampledDistribution)
  })
})
