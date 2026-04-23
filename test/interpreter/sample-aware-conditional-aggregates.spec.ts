import {CellValueDetailedType} from '../../src/Cell'
import {HyperFormula} from '../../src'
import {SampledDistribution} from '../../src/interpreter/InterpreterValue'
import {adr} from '../testUtils'

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

describe('sample-aware conditional aggregates', () => {
  it('returns sampled distributions for COUNTIF and COUNTIFS over uncertain tested ranges', () => {
    const engine = HyperFormula.buildFromArray([
      ['N(0, 0)', 'N(1, 0)', 'N(2, 0)'],
      ['N(10, 0)', 'N(20, 0)', 'N(30, 0)'],
      ['=COUNTIF(A1:C1, ">=1")', '=COUNTIFS(A1:C1, ">=1", A2:C2, ">=20")'],
    ], {
      sampleSize: 1000,
    })

    expectConstantSampledDistribution(engine.getCellValue(adr('A3')), 2)
    expectConstantSampledDistribution(engine.getCellValue(adr('B3')), 2)
    expect(engine.getCellValueDetailedType(adr('A3'))).toBe(CellValueDetailedType.NUMBER_SAMPLED)
  })

  it('returns sampled distributions for SUMIF, SUMIFS, and AVERAGEIF over uncertain tested and values ranges', () => {
    const engine = HyperFormula.buildFromArray([
      ['N(0, 0)', 'N(1, 0)', 'N(2, 0)'],
      ['N(10, 0)', 'N(20, 0)', 'N(30, 0)'],
      ['=SUMIF(A1:C1, ">=1", A2:C2)', '=SUMIFS(A2:C2, A1:C1, ">=1", A2:C2, ">=20")', '=AVERAGEIF(A1:C1, ">=1", A2:C2)'],
    ], {
      sampleSize: 1000,
    })

    expectConstantSampledDistribution(engine.getCellValue(adr('A3')), 50)
    expectConstantSampledDistribution(engine.getCellValue(adr('B3')), 50)
    expectConstantSampledDistribution(engine.getCellValue(adr('C3')), 25)
  })

  it('returns sampled distributions for MINIFS and MAXIFS over uncertain tested and values ranges', () => {
    const engine = HyperFormula.buildFromArray([
      ['N(0, 0)', 'N(1, 0)', 'N(2, 0)'],
      ['N(10, 0)', 'N(20, 0)', 'N(30, 0)'],
      ['=MINIFS(A2:C2, A1:C1, ">=1")', '=MAXIFS(A2:C2, A1:C1, ">=1")'],
    ], {
      sampleSize: 1000,
    })

    expectConstantSampledDistribution(engine.getCellValue(adr('A3')), 20)
    expectConstantSampledDistribution(engine.getCellValue(adr('B3')), 30)
  })

  it('supports uncertain scalar criteria by parsing the sampled criterion per trial', () => {
    const engine = HyperFormula.buildFromArray([
      ['N(0, 0)', 'N(1, 0)', 'N(2, 0)', 'N(1, 0)'],
      ['=COUNTIF(A1:C1, D1)', '=SUMIF(A1:C1, D1, A1:C1)'],
    ], {
      sampleSize: 1000,
    })

    expectConstantSampledDistribution(engine.getCellValue(adr('A2')), 1)
    expectConstantSampledDistribution(engine.getCellValue(adr('B2')), 1)
  })

  it('keeps deterministic conditional aggregates scalar', () => {
    const engine = HyperFormula.buildFromArray([
      ['0', '1', '2'],
      ['10', '20', '30'],
      ['=COUNTIF(A1:C1, ">=1")', '=SUMIF(A1:C1, ">=1", A2:C2)', '=AVERAGEIF(A1:C1, ">=1", A2:C2)', '=MINIFS(A2:C2, A1:C1, ">=1")', '=MAXIFS(A2:C2, A1:C1, ">=1")'],
    ])

    expect(engine.getCellValue(adr('A3'))).toBe(2)
    expect(engine.getCellValue(adr('B3'))).toBe(50)
    expect(engine.getCellValue(adr('C3'))).toBe(25)
    expect(engine.getCellValue(adr('D3'))).toBe(20)
    expect(engine.getCellValue(adr('E3'))).toBe(30)
  })
})
