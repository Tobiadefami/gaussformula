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
  expect(sampled.getMean()).toBeCloseTo(expected, 10)
  expect(sampled.getSamples()).toHaveLength(1000)
  expect(sampled.getSamples().every((sample) => Math.abs(sample - expected) < 1e-10)).toBe(true)
  return sampled
}

describe('sample-aware statistical aggregate functions', () => {
  it('returns sampled distributions for variance and standard deviation over uncertain ranges', () => {
    const engine = HyperFormula.buildFromArray([
      ['N(10, 0)', 'N(20, 0)'],
      ['=VAR.S(A1:B1)', '=VAR.P(A1:B1)'],
      ['=STDEV.S(A1:B1)', '=STDEV.P(A1:B1)'],
    ], {
      sampleSize: 1000,
    })

    expectConstantSampledDistribution(engine.getCellValue(adr('A2')), 50)
    expectConstantSampledDistribution(engine.getCellValue(adr('B2')), 25)
    expectConstantSampledDistribution(engine.getCellValue(adr('A3')), Math.sqrt(50))
    expectConstantSampledDistribution(engine.getCellValue(adr('B3')), 5)
    expect(engine.getCellValueDetailedType(adr('A2'))).toBe(CellValueDetailedType.NUMBER_SAMPLED)
  })

  it('returns sampled distributions for rank and median aggregates over uncertain ranges', () => {
    const engine = HyperFormula.buildFromArray([
      ['N(10, 0)', 'N(20, 0)', 'N(30, 0)'],
      ['=MEDIAN(A1:C1)', '=LARGE(A1:C1, 1)', '=SMALL(A1:C1, 1)'],
    ], {
      sampleSize: 1000,
    })

    expectConstantSampledDistribution(engine.getCellValue(adr('A2')), 20)
    expectConstantSampledDistribution(engine.getCellValue(adr('B2')), 30)
    expectConstantSampledDistribution(engine.getCellValue(adr('C2')), 10)
  })

  it('returns sampled distributions for statistical aggregates over uncertain ranges', () => {
    const engine = HyperFormula.buildFromArray([
      ['N(10, 0)', 'N(20, 0)'],
      ['=AVEDEV(A1:B1)', '=DEVSQ(A1:B1)'],
      ['=GEOMEAN(A1:B1)', '=HARMEAN(A1:B1)'],
    ], {
      sampleSize: 1000,
    })

    expectConstantSampledDistribution(engine.getCellValue(adr('A2')), 5)
    expectConstantSampledDistribution(engine.getCellValue(adr('B2')), 50)
    expectConstantSampledDistribution(engine.getCellValue(adr('A3')), Math.sqrt(200))
    expectConstantSampledDistribution(engine.getCellValue(adr('B3')), 2 / ((1 / 10) + (1 / 20)))
  })

  it('keeps deterministic statistical aggregate results scalar', () => {
    const engine = HyperFormula.buildFromArray([
      ['=VAR.S(10, 20)', '=VAR.P(10, 20)', '=STDEV.S(10, 20)', '=STDEV.P(10, 20)'],
      ['=MEDIAN(10, 20, 30)', '=AVEDEV(10, 20)', '=DEVSQ(10, 20)'],
      ['=GEOMEAN(10, 20)', '=HARMEAN(10, 20)'],
    ])

    expect(engine.getCellValue(adr('A1'))).toBe(50)
    expect(engine.getCellValue(adr('B1'))).toBe(25)
    expect(engine.getCellValue(adr('C1'))).toBeCloseTo(Math.sqrt(50), 10)
    expect(engine.getCellValue(adr('D1'))).toBe(5)
    expect(engine.getCellValue(adr('A2'))).toBe(20)
    expect(engine.getCellValue(adr('B2'))).toBe(5)
    expect(engine.getCellValue(adr('C2'))).toBe(50)
    expect(engine.getCellValue(adr('A3'))).toBeCloseTo(Math.sqrt(200), 8)
    expect(engine.getCellValue(adr('B3'))).toBeCloseTo(2 / ((1 / 10) + (1 / 20)), 8)
  })
})
