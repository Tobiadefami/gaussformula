import { ArithmeticHelper } from '../../src/interpreter/ArithmeticHelper'
import { Config } from '../../src/Config'
import { DateTimeHelper } from '../../src/DateTimeHelper'
import { NumberLiteralHelper } from '../../src/NumberLiteralHelper'
import { LogNormalNumber, UniformNumber, SampledDistribution } from '../../src/interpreter/InterpreterValue'

function createHelper() {
  const config = new Config()
  const dt = new DateTimeHelper(config)
  const numLit = new NumberLiteralHelper(config)
  return new ArithmeticHelper(config, dt, numLit)
}

describe('Distribution arithmetic integration (Phase 2)', () => {
  const helper = createHelper()

  it('multiply two LogNormalNumber returns SampledDistribution', () => {
    const ln1 = new LogNormalNumber(0, 0.16)
    const ln2 = new LogNormalNumber(0.1, 0.09)

    const result = helper.multiply(ln1, ln2)
    expect(result).toBeInstanceOf(SampledDistribution)
    expect((result as SampledDistribution).getSamples().length).toBe(Config.defaultConfig.sampleSize)
  })

  it('add two UniformNumber returns SampledDistribution', () => {
    const u1 = new UniformNumber(0, 1)
    const u2 = new UniformNumber(-1, 2)
    const result = helper.addWithEpsilon(u1, u2)
    expect(result).toBeInstanceOf(SampledDistribution)
  })

  it('divide UniformNumber by scalar produces SampledDistribution', () => {
    const u = new UniformNumber(2, 6)
    const result = helper.divide(u, 2)
    expect(result).toBeInstanceOf(SampledDistribution)
  })
}) 