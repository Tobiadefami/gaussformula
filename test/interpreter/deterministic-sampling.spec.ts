import { Config } from '../../src/Config'
import { HyperFormula } from '../../src/HyperFormula'
import {
  ConfidenceIntervalNumber,
  SampledDistribution,
} from '../../src/interpreter/InterpreterValue'
import { adr } from '../testUtils'

describe('deterministic uncertainty sampling', () => {
  const config = new Config({ simulationSeed: 'simulation-alpha' } as any)

  it('returns the same samples for the same confidence interval identity', () => {
    const first = new ConfidenceIntervalNumber(10, 20, 90, {
      samplingIdentity: '0:0:0',
    } as any)
    const second = new ConfidenceIntervalNumber(10, 20, 90, {
      samplingIdentity: '0:0:0',
    } as any)

    expect(first.toSamples(config)).toEqual(second.toSamples(config))
  })

  it('returns different samples for different confidence interval identities', () => {
    const first = new ConfidenceIntervalNumber(10, 20, 90, {
      samplingIdentity: '0:0:0',
    } as any)
    const second = new ConfidenceIntervalNumber(10, 20, 90, {
      samplingIdentity: '0:0:1',
    } as any)

    expect(first.toSamples(config)).not.toEqual(second.toSamples(config))
  })

  it('uses a deterministic default seed when no config is provided', () => {
    const interval = new ConfidenceIntervalNumber(10, 20, 90, {
      samplingIdentity: '0:0:0',
    } as any)

    expect(interval.toSamples()).toEqual(interval.toSamples())
  })

  it('attaches independent sampling identities to identical CI cells', () => {
    const engine = HyperFormula.buildFromArray(
      [['CI[10,20]', 'CI[10,20]']],
      { simulationSeed: 'simulation-alpha' } as any
    )

    const first = engine.getCellValue(adr('A1')) as ConfidenceIntervalNumber
    const second = engine.getCellValue(adr('B1')) as ConfidenceIntervalNumber

    expect(first.toSamples(config)).toEqual(first.toSamples(config))
    expect(first.toSamples(config)).not.toEqual(second.toSamples(config))
  })

  it('recalculates formula distributions reproducibly for the same workbook seed', () => {
    const buildEngine = () =>
      HyperFormula.buildFromArray(
        [['CI[10,20]', 'CI[2,4]', '=A1*B1']],
        { simulationSeed: 'simulation-alpha' } as any
      )

    const first = buildEngine().getCellValue(adr('C1')) as SampledDistribution
    const second = buildEngine().getCellValue(adr('C1')) as SampledDistribution

    expect(first.getSamples()).toEqual(second.getSamples())
  })
})
