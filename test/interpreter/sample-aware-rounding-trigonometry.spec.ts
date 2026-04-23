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

describe('sample-aware rounding and trigonometry functions', () => {
  it('returns sampled distributions for rounding-style pointwise functions over uncertain values', () => {
    const engine = HyperFormula.buildFromArray([
      ['N(1.47, 0)', 'N(1, 0)', 'N(-1.7, 0)', 'N(4.43, 0)', 'N(0.3, 0)', 'N(-11, 0)', 'N(2, 0)', 'N(1, 0)'],
      ['=ROUND(A1, B1)', '=ROUNDUP(A1, B1)', '=ROUNDDOWN(A1, B1)', '=INT(C1)', '=EVEN(C1)', '=ODD(C1)', '=CEILING(D1, E1)', '=CEILING.PRECISE(D1, E1)'],
      ['=FLOOR(D1, E1)', '=CEILING.MATH(F1, G1, H1)', '=FLOOR.MATH(F1, G1, H1)', '=FLOOR.PRECISE(F1, G1)', '=SQRTPI(B1)'],
    ], {
      sampleSize: 1000,
    })

    expectConstantSampledDistribution(engine.getCellValue(adr('A2')), 1.5)
    expectConstantSampledDistribution(engine.getCellValue(adr('B2')), 1.5)
    expectConstantSampledDistribution(engine.getCellValue(adr('C2')), 1.4)
    expectConstantSampledDistribution(engine.getCellValue(adr('D2')), -1)
    expectConstantSampledDistribution(engine.getCellValue(adr('E2')), -2)
    expectConstantSampledDistribution(engine.getCellValue(adr('F2')), -3)
    expectConstantSampledDistribution(engine.getCellValue(adr('G2')), 4.5)
    expectConstantSampledDistribution(engine.getCellValue(adr('H2')), 4.5)
    expectConstantSampledDistribution(engine.getCellValue(adr('A3')), 4.2)
    expectConstantSampledDistribution(engine.getCellValue(adr('B3')), -12)
    expectConstantSampledDistribution(engine.getCellValue(adr('C3')), -10)
    expectConstantSampledDistribution(engine.getCellValue(adr('D3')), -12)
    expectConstantSampledDistribution(engine.getCellValue(adr('E3')), Math.sqrt(Math.PI))
    expect(engine.getCellValueDetailedType(adr('A2'))).toBe(CellValueDetailedType.NUMBER_SAMPLED)
  })

  it('returns sampled distributions for trigonometric pointwise functions over uncertain values', () => {
    const engine = HyperFormula.buildFromArray([
      ['N(0.5, 0)', 'N(1, 0)', 'N(2, 0)'],
      ['=SIN(A1)', '=COS(A1)', '=TAN(A1)', '=ASIN(A1)', '=ACOS(A1)', '=ATAN(A1)', '=ATAN2(B1, C1)', '=COT(A1)', '=SEC(A1)', '=CSC(A1)', '=ACOT(A1)'],
      ['=SINH(A1)', '=COSH(A1)', '=TANH(A1)', '=ASINH(A1)', '=ACOSH(C1)', '=ATANH(A1)', '=COTH(A1)', '=SECH(A1)', '=CSCH(A1)', '=ACOTH(C1)'],
    ], {
      sampleSize: 1000,
    })

    expectConstantSampledDistribution(engine.getCellValue(adr('A2')), Math.sin(0.5))
    expectConstantSampledDistribution(engine.getCellValue(adr('B2')), Math.cos(0.5))
    expectConstantSampledDistribution(engine.getCellValue(adr('C2')), Math.tan(0.5))
    expectConstantSampledDistribution(engine.getCellValue(adr('D2')), Math.asin(0.5))
    expectConstantSampledDistribution(engine.getCellValue(adr('E2')), Math.acos(0.5))
    expectConstantSampledDistribution(engine.getCellValue(adr('F2')), Math.atan(0.5))
    expectConstantSampledDistribution(engine.getCellValue(adr('G2')), Math.atan2(2, 1))
    expectConstantSampledDistribution(engine.getCellValue(adr('H2')), 1 / Math.tan(0.5))
    expectConstantSampledDistribution(engine.getCellValue(adr('I2')), 1 / Math.cos(0.5))
    expectConstantSampledDistribution(engine.getCellValue(adr('J2')), 1 / Math.sin(0.5))
    expectConstantSampledDistribution(engine.getCellValue(adr('K2')), Math.atan(2))
    expectConstantSampledDistribution(engine.getCellValue(adr('A3')), Math.sinh(0.5))
    expectConstantSampledDistribution(engine.getCellValue(adr('B3')), Math.cosh(0.5))
    expectConstantSampledDistribution(engine.getCellValue(adr('C3')), Math.tanh(0.5))
    expectConstantSampledDistribution(engine.getCellValue(adr('D3')), Math.asinh(0.5))
    expectConstantSampledDistribution(engine.getCellValue(adr('E3')), Math.acosh(2))
    expectConstantSampledDistribution(engine.getCellValue(adr('F3')), Math.atanh(0.5))
    expectConstantSampledDistribution(engine.getCellValue(adr('G3')), 1 / Math.tanh(0.5))
    expectConstantSampledDistribution(engine.getCellValue(adr('H3')), 1 / Math.cosh(0.5))
    expectConstantSampledDistribution(engine.getCellValue(adr('I3')), 1 / Math.sinh(0.5))
    expectConstantSampledDistribution(engine.getCellValue(adr('J3')), Math.atanh(0.5))
  })

  it('preserves existing error behavior for invalid uncertain rounding and trigonometric inputs', () => {
    const engine = HyperFormula.buildFromArray([
      ['N(0, 0)', 'N(2, 0)', 'N(-1, 0)', 'N(3.14, 0)', 'N(-2, 0)'],
      ['=COT(A1)', '=CSC(A1)', '=COTH(A1)', '=CSCH(A1)', '=ACOTH(A1)', '=ATAN2(A1, A1)', '=ACOS(B1)', '=SQRTPI(C1)', '=CEILING(D1, E1)'],
    ], {
      sampleSize: 1000,
    })

    expect(engine.getCellValue(adr('A2'))).toEqualError(detailedError(ErrorType.DIV_BY_ZERO))
    expect(engine.getCellValue(adr('B2'))).toEqualError(detailedError(ErrorType.DIV_BY_ZERO))
    expect(engine.getCellValue(adr('C2'))).toEqualError(detailedError(ErrorType.DIV_BY_ZERO))
    expect(engine.getCellValue(adr('D2'))).toEqualError(detailedError(ErrorType.DIV_BY_ZERO))
    expect(engine.getCellValue(adr('E2'))).toEqualError(detailedError(ErrorType.NUM, ErrorMessage.NonZero))
    expect(engine.getCellValue(adr('F2'))).toEqualError(detailedError(ErrorType.DIV_BY_ZERO))
    expect(engine.getCellValue(adr('G2'))).toEqualError(detailedError(ErrorType.NUM, ErrorMessage.NaN))
    expect(engine.getCellValue(adr('H2'))).toEqualError(detailedError(ErrorType.NUM, ErrorMessage.ValueSmall))
    expect(engine.getCellValue(adr('I2'))).toEqualError(detailedError(ErrorType.NUM, ErrorMessage.DistinctSigns))
  })
})
