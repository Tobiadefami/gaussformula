import {CellValueDetailedType, ErrorType} from '../../src/Cell'
import {HyperFormula} from '../../src'
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

describe('sample-aware comparisons and conditionals', () => {
  it('returns sampled distributions for comparison operators over uncertain values', () => {
    const engine = HyperFormula.buildFromArray([
      ['N(10, 0)', 'N(20, 0)'],
      ['=A1<B1', '=A1>B1', '=A1=B1', '=A1<>B1', '=A1<=B1', '=A1>=B1'],
    ], {
      sampleSize: 1000,
    })

    expectConstantSampledDistribution(engine.getCellValue(adr('A2')), 1)
    expectConstantSampledDistribution(engine.getCellValue(adr('B2')), 0)
    expectConstantSampledDistribution(engine.getCellValue(adr('C2')), 0)
    expectConstantSampledDistribution(engine.getCellValue(adr('D2')), 1)
    expectConstantSampledDistribution(engine.getCellValue(adr('E2')), 1)
    expectConstantSampledDistribution(engine.getCellValue(adr('F2')), 0)
    expect(engine.getCellValueDetailedType(adr('A2'))).toBe(CellValueDetailedType.NUMBER_SAMPLED)
  })

  it('returns sampled distributions for HF comparison functions over uncertain values', () => {
    const engine = HyperFormula.buildFromArray([
      ['N(10, 0)', 'N(20, 0)'],
      ['=HF.LT(A1, B1)', '=HF.GT(A1, B1)', '=HF.EQ(A1, B1)', '=HF.NE(A1, B1)', '=HF.LTE(A1, B1)', '=HF.GTE(A1, B1)'],
    ], {
      sampleSize: 1000,
    })

    expectConstantSampledDistribution(engine.getCellValue(adr('A2')), 1)
    expectConstantSampledDistribution(engine.getCellValue(adr('B2')), 0)
    expectConstantSampledDistribution(engine.getCellValue(adr('C2')), 0)
    expectConstantSampledDistribution(engine.getCellValue(adr('D2')), 1)
    expectConstantSampledDistribution(engine.getCellValue(adr('E2')), 1)
    expectConstantSampledDistribution(engine.getCellValue(adr('F2')), 0)
  })

  it('returns sampled distributions for numeric conditionals over uncertain conditions', () => {
    const engine = HyperFormula.buildFromArray([
      ['N(10, 0)', 'N(20, 0)'],
      ['=IF(A1<B1, 1, 0)', '=IFS(A1>B1, 1, A1<B1, 2)'],
    ], {
      sampleSize: 1000,
    })

    expectConstantSampledDistribution(engine.getCellValue(adr('A2')), 1)
    expectConstantSampledDistribution(engine.getCellValue(adr('B2')), 2)
  })

  it('returns sampled distributions for boolean functions over uncertain conditions', () => {
    const engine = HyperFormula.buildFromArray([
      ['N(10, 0)', 'N(20, 0)'],
      ['=AND(A1<B1, B1>15)', '=OR(A1>B1, B1>15)', '=XOR(A1<B1, B1>15)', '=NOT(A1<B1)'],
    ], {
      sampleSize: 1000,
    })

    expectConstantSampledDistribution(engine.getCellValue(adr('A2')), 1)
    expectConstantSampledDistribution(engine.getCellValue(adr('B2')), 1)
    expectConstantSampledDistribution(engine.getCellValue(adr('C2')), 0)
    expectConstantSampledDistribution(engine.getCellValue(adr('D2')), 0)
  })

  it('returns VALUE when sampled IF branches are not numeric', () => {
    const engine = HyperFormula.buildFromArray([
      ['N(10, 0)', 'N(20, 0)', '=IF(A1<B1, "yes", "no")'],
    ], {
      sampleSize: 1000,
    })

    expect(engine.getCellValue(adr('C1'))).toEqualError(detailedError(ErrorType.VALUE, ErrorMessage.NumberCoercion))
  })

  it('keeps deterministic comparisons and conditionals scalar', () => {
    const engine = HyperFormula.buildFromArray([
      ['=1<2', '=HF.LT(1, 2)', '=IF(1<2, 1, 0)', '=AND(1<2, 2>1)', '=NOT(1<2)'],
    ])

    expect(engine.getCellValue(adr('A1'))).toBe(true)
    expect(engine.getCellValue(adr('B1'))).toBe(true)
    expect(engine.getCellValue(adr('C1'))).toBe(1)
    expect(engine.getCellValue(adr('D1'))).toBe(true)
    expect(engine.getCellValue(adr('E1'))).toBe(false)
  })
})
