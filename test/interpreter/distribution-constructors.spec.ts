import { CellValueDetailedType, ErrorType } from '../../src/Cell'
import {
  DistributionNumber,
  SampledDistribution,
} from '../../src/interpreter/InterpreterValue'
import { HyperFormula } from '../../src'
import { adr, detailedError } from '../testUtils'

const expectDistribution = (
  value: unknown,
  kind: 'normal' | 'lognormal' | 'uniform'
): DistributionNumber => {
  expect(value).toBeInstanceOf(DistributionNumber)
  const distribution = value as DistributionNumber
  expect(distribution.kind).toBe(kind)
  return distribution
}

describe('explicit distribution constructors', () => {
  it('parses explicit normal, lognormal, and uniform cell values', () => {
    const engine = HyperFormula.buildFromArray([
      ['N(1, 4)', 'LN(0, 0.5)', 'U(1, 2)'],
    ])

    const normal = expectDistribution(engine.getCellValue(adr('A1')), 'normal')
    const lognormal = expectDistribution(engine.getCellValue(adr('B1')), 'lognormal')
    const uniform = expectDistribution(engine.getCellValue(adr('C1')), 'uniform')

    expect(normal.mean).toBe(1)
    expect(normal.variance).toBe(4)
    expect(lognormal.mu).toBe(0)
    expect(lognormal.sigma).toBe(0.5)
    expect(uniform.min).toBe(1)
    expect(uniform.max).toBe(2)
    expect(engine.getCellValueDetailedType(adr('A1'))).toBe(CellValueDetailedType.NUMBER_DISTRIBUTION)
  })

  it('derives normal and lognormal distributions from explicit confidence interval constructors', () => {
    const engine = HyperFormula.buildFromArray([
      ['N.CI(1, 2, 0.95)', 'LN.CI(1, 2, 0.95)'],
    ])

    const normal = expectDistribution(engine.getCellValue(adr('A1')), 'normal')
    const lognormal = expectDistribution(engine.getCellValue(adr('B1')), 'lognormal')
    const zScore95 = 1.9599639845400545

    expect(normal.mean).toBe(1.5)
    expect(normal.variance).toBeCloseTo(Math.pow(1 / (2 * zScore95), 2), 12)
    expect(normal.source).toBe('ci')
    expect(normal.confidenceLevel).toBe(95)
    expect(engine.getCellSerialized(adr('A1'))).toBe('N.CI(1.00, 2.00)')

    expect(lognormal.mu).toBeCloseTo(Math.log(2) / 2, 8)
    expect(lognormal.sigma).toBeCloseTo(Math.log(2) / (2 * zScore95), 12)
    expect(lognormal.source).toBe('ci')
    expect(lognormal.confidenceLevel).toBe(95)
    expect(engine.getCellSerialized(adr('B1'))).toBe('LN.CI(1.00, 2.00)')
  })

  it('defaults confidence interval constructors to 95 percent when confidence is omitted', () => {
    const engine = HyperFormula.buildFromArray([
      ['N.CI(1, 2)', 'LN.CI(1, 2)', '=N.CI(1, 2)+1', '=LN.CI(1, 2)+1'],
    ])

    const normal = expectDistribution(engine.getCellValue(adr('A1')), 'normal')
    const lognormal = expectDistribution(engine.getCellValue(adr('B1')), 'lognormal')
    const zScore95 = 1.9599639845400545

    expect(normal.mean).toBe(1.5)
    expect(normal.variance).toBeCloseTo(Math.pow(1 / (2 * zScore95), 2), 12)
    expect(normal.source).toBe('ci')
    expect(normal.confidenceLevel).toBe(95)
    expect(engine.getCellSerialized(adr('A1'))).toBe('N.CI(1.00, 2.00)')

    expect(lognormal.mu).toBeCloseTo(Math.log(2) / 2, 8)
    expect(lognormal.sigma).toBeCloseTo(Math.log(2) / (2 * zScore95), 12)
    expect(lognormal.source).toBe('ci')
    expect(lognormal.confidenceLevel).toBe(95)
    expect(engine.getCellSerialized(adr('B1'))).toBe('LN.CI(1.00, 2.00)')

    expect(engine.getCellValue(adr('C1'))).toBeInstanceOf(SampledDistribution)
    expect(engine.getCellValue(adr('D1'))).toBeInstanceOf(SampledDistribution)
  })

  it('uses the exact normal quantile for non-table confidence levels', () => {
    const engine = HyperFormula.buildFromArray([
      ['N.CI(18, 22, 0.93)'],
    ])

    const normal = expectDistribution(engine.getCellValue(adr('A1')), 'normal')
    const zScore93 = 1.8119106729525978
    const std = (22 - 18) / (2 * zScore93)

    expect(normal.mean).toBe(20)
    expect(normal.variance).toBeCloseTo(std * std, 12)
    expect(normal.confidenceLevel).toBe(93)
    expect(engine.getCellSerialized(adr('A1'))).toBe('N.CI(18.00, 22.00, 0.93)')
  })

  it('supports explicit distribution constructors inside formulas', () => {
    const engine = HyperFormula.buildFromArray([
      ['=N(10, 4)+2', '=U(1, 2)*3', '=LN.CI(1, 2, 95)+1'],
    ])

    expect(engine.getCellValue(adr('A1'))).toBeInstanceOf(SampledDistribution)
    expect(engine.getCellValue(adr('B1'))).toBeInstanceOf(SampledDistribution)
    expect(engine.getCellValue(adr('C1'))).toBeInstanceOf(SampledDistribution)
  })

  it('propagates explicit distribution cell references through arithmetic', () => {
    const engine = HyperFormula.buildFromArray([
      ['N.CI(18, 22)', '=A1*2', '=A1+2', '=A1/2'],
    ])

    expect(engine.getCellValue(adr('A1'))).toBeInstanceOf(DistributionNumber)
    expect(engine.getCellValue(adr('B1'))).toBeInstanceOf(SampledDistribution)
    expect(engine.getCellValue(adr('C1'))).toBeInstanceOf(SampledDistribution)
    expect(engine.getCellValue(adr('D1'))).toBeInstanceOf(SampledDistribution)
  })

  it('keeps the existing one-argument LN function as natural log', () => {
    const engine = HyperFormula.buildFromArray([
      ['=LN(2.718281828459045)'],
    ])

    expect(engine.getCellValue(adr('A1'))).toBeCloseTo(1, 12)
  })

  it('does not parse legacy CI or range shorthand as uncertainty inputs', () => {
    const engine = HyperFormula.buildFromArray([
      ['CI[1, 2]', '[1, 2]', '1 to 2'],
    ])

    expect(engine.getCellValue(adr('A1'))).toBe('CI[1, 2]')
    expect(engine.getCellValue(adr('B1'))).toBe('[1, 2]')
    expect(engine.getCellValue(adr('C1'))).toBe('1 to 2')
  })

  it('rejects invalid distribution constructor arguments in formulas', () => {
    const engine = HyperFormula.buildFromArray([
      ['=N(1, -1)', '=LN.CI(0, 2, 0.95)', '=U(2, 1)'],
    ])

    expect(engine.getCellValue(adr('A1'))).toEqualError(detailedError(ErrorType.NUM))
    expect(engine.getCellValue(adr('B1'))).toEqualError(detailedError(ErrorType.NUM))
    expect(engine.getCellValue(adr('C1'))).toEqualError(detailedError(ErrorType.NUM))
  })
})
