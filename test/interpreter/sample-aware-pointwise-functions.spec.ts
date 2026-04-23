import {ErrorType, HyperFormula} from '../../src'
import {CellValueDetailedType} from '../../src/Cell'
import {ErrorMessage} from '../../src/error-message'
import {SampledDistribution} from '../../src/interpreter/InterpreterValue'
import {adr, detailedError} from '../testUtils'

const expectConstantSampledDistribution = (
  value: unknown,
  expected: number
): SampledDistribution => {
  expect(value).toBeInstanceOf(SampledDistribution)
  const sampled = value as SampledDistribution
  expect(sampled.getSamples()).toHaveLength(1000)
  expect(sampled.getMean()).toBeCloseTo(expected, 10)
  expect(sampled.getSamples().every((sample) => Math.abs(sample - expected) < 1e-10)).toBe(true)
  return sampled
}

describe('sample-aware pointwise numeric functions', () => {
  it('returns sampled distributions for unary pointwise functions over uncertain values', () => {
    const engine = HyperFormula.buildFromArray([
      ['N(-4, 0)', 'N(4, 0)', 'N(1, 0)', 'N(100, 0)'],
      ['=ABS(A1)', '=SQRT(B1)', '=EXP(C1)', '=LN(B1)', '=LOG10(D1)'],
    ], {
      sampleSize: 1000,
    })

    expectConstantSampledDistribution(engine.getCellValue(adr('A2')), 4)
    expectConstantSampledDistribution(engine.getCellValue(adr('B2')), 2)
    expectConstantSampledDistribution(engine.getCellValue(adr('C2')), Math.E)
    expectConstantSampledDistribution(engine.getCellValue(adr('D2')), Math.log(4))
    expectConstantSampledDistribution(engine.getCellValue(adr('E2')), 2)
    expect(engine.getCellValueDetailedType(adr('A2'))).toBe(CellValueDetailedType.NUMBER_SAMPLED)
  })

  it('returns sampled distributions for LOG when the value or base is uncertain', () => {
    const engine = HyperFormula.buildFromArray([
      ['N(8, 0)', 'N(2, 0)', '=LOG(A1, B1)', '=LOG(A1, 2)', '=LOG(8, B1)'],
    ], {
      sampleSize: 1000,
    })

    expectConstantSampledDistribution(engine.getCellValue(adr('C1')), 3)
    expectConstantSampledDistribution(engine.getCellValue(adr('D1')), 3)
    expectConstantSampledDistribution(engine.getCellValue(adr('E1')), 3)
  })

  it('keeps deterministic pointwise function results scalar', () => {
    const engine = HyperFormula.buildFromArray([
      ['=ABS(-4)', '=SQRT(4)', '=EXP(1)', '=LN(4)', '=LOG10(100)', '=LOG(8, 2)'],
    ])

    expect(engine.getCellValue(adr('A1'))).toBe(4)
    expect(engine.getCellValue(adr('B1'))).toBe(2)
    expect(engine.getCellValue(adr('C1'))).toBeCloseTo(Math.E, 10)
    expect(engine.getCellValue(adr('D1'))).toBeCloseTo(Math.log(4), 10)
    expect(engine.getCellValue(adr('E1'))).toBe(2)
    expect(engine.getCellValue(adr('F1'))).toBe(3)
  })

  it('returns existing NUM errors for invalid sampled pointwise results', () => {
    const engine = HyperFormula.buildFromArray([
      ['N(-4, 0)', '=SQRT(A1)', '=LN(A1)', '=LOG10(A1)', '=LOG(A1, 2)', '=LOG(8, N(1, 0))'],
    ], {
      sampleSize: 1000,
    })

    expect(engine.getCellValue(adr('B1'))).toEqualError(detailedError(ErrorType.NUM, ErrorMessage.NaN))
    expect(engine.getCellValue(adr('C1'))).toEqualError(detailedError(ErrorType.NUM, ErrorMessage.NaN))
    expect(engine.getCellValue(adr('D1'))).toEqualError(detailedError(ErrorType.NUM, ErrorMessage.NaN))
    expect(engine.getCellValue(adr('E1'))).toEqualError(detailedError(ErrorType.NUM, ErrorMessage.ValueSmall))
    expect(engine.getCellValue(adr('F1'))).toEqualError(detailedError(ErrorType.NUM, ErrorMessage.NaN))
  })
})
