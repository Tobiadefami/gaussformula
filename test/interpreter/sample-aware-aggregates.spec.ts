import {CellValueDetailedType} from '../../src/Cell'
import {SampledDistribution} from '../../src/interpreter/InterpreterValue'
import {HyperFormula} from '../../src'
import {adr} from '../testUtils'

const expectConstantSampledDistribution = (
  value: unknown,
  expected: number
): SampledDistribution => {
  expect(value).toBeInstanceOf(SampledDistribution)
  const sampled = value as SampledDistribution
  expect(sampled.getMean()).toBe(expected)
  expect(sampled.getSamples()).toHaveLength(1000)
  expect(sampled.getSamples().every((sample) => sample === expected)).toBe(true)
  return sampled
}

describe('sample-aware aggregate functions', () => {
  it('returns sampled distributions for basic numeric aggregates over uncertain ranges', () => {
    const engine = HyperFormula.buildFromArray([
      ['N(10, 0)', 'N(20, 0)'],
      ['=SUM(A1:B1)', '=AVERAGE(A1:B1)', '=MIN(A1:B1)', '=MAX(A1:B1)'],
      ['=PRODUCT(A1:B1)', '=SUMSQ(A1:B1)'],
    ], {
      sampleSize: 1000,
    })

    expectConstantSampledDistribution(engine.getCellValue(adr('A2')), 30)
    expectConstantSampledDistribution(engine.getCellValue(adr('B2')), 15)
    expectConstantSampledDistribution(engine.getCellValue(adr('C2')), 10)
    expectConstantSampledDistribution(engine.getCellValue(adr('D2')), 20)
    expectConstantSampledDistribution(engine.getCellValue(adr('A3')), 200)
    expectConstantSampledDistribution(engine.getCellValue(adr('B3')), 500)
    expect(engine.getCellValueDetailedType(adr('A2'))).toBe(CellValueDetailedType.NUMBER_SAMPLED)
  })

  it('keeps deterministic aggregate results scalar', () => {
    const engine = HyperFormula.buildFromArray([
      ['=SUM(10, 20)', '=AVERAGE(10, 20)', '=MIN(10, 20)', '=MAX(10, 20)'],
      ['=PRODUCT(10, 20)', '=SUMSQ(10, 20)'],
    ])

    expect(engine.getCellValue(adr('A1'))).toBe(30)
    expect(engine.getCellValue(adr('B1'))).toBe(15)
    expect(engine.getCellValue(adr('C1'))).toBe(10)
    expect(engine.getCellValue(adr('D1'))).toBe(20)
    expect(engine.getCellValue(adr('A2'))).toBe(200)
    expect(engine.getCellValue(adr('B2'))).toBe(500)
  })

  it('returns sampled distributions for SUMPRODUCT over uncertain ranges', () => {
    const engine = HyperFormula.buildFromArray([
      ['N(10, 0)', 'N(20, 0)'],
      ['N(2, 0)', 'N(3, 0)'],
      ['=SUMPRODUCT(A1:B1, A2:B2)'],
    ], {
      sampleSize: 1000,
    })

    expectConstantSampledDistribution(engine.getCellValue(adr('A3')), 80)
  })
})
