import { Config } from '../../src/Config'
import { HyperFormula } from '../../src/HyperFormula'
import {
  DistributionNumber,
  SampledDistribution,
} from '../../src/interpreter/InterpreterValue'
import { adr } from '../testUtils'

describe('deterministic uncertainty sampling', () => {
  const config = new Config({ simulationSeed: 'simulation-alpha' } as any)

  it('returns the same samples for the same distribution identity', () => {
    const first = DistributionNumber.normal(10, 2, {
      samplingIdentity: '0:0:0',
    })
    const second = DistributionNumber.normal(10, 2, {
      samplingIdentity: '0:0:0',
    })

    expect(first.toSamples(config)).toEqual(second.toSamples(config))
  })

  it('returns different samples for different distribution identities', () => {
    const first = DistributionNumber.normal(10, 2, {
      samplingIdentity: '0:0:0',
    })
    const second = DistributionNumber.normal(10, 2, {
      samplingIdentity: '0:0:1',
    })

    expect(first.toSamples(config)).not.toEqual(second.toSamples(config))
  })

  it('uses a deterministic default seed when no config is provided', () => {
    const distribution = DistributionNumber.normal(10, 2, {
      samplingIdentity: '0:0:0',
    })

    expect(distribution.toSamples()).toEqual(distribution.toSamples())
  })

  it('attaches independent sampling identities to identical distribution cells', () => {
    const engine = HyperFormula.buildFromArray(
      [['N(10, 2)', 'N(10, 2)']],
      { simulationSeed: 'simulation-alpha' } as any
    )

    const first = engine.getCellValue(adr('A1')) as DistributionNumber
    const second = engine.getCellValue(adr('B1')) as DistributionNumber

    expect(first.toSamples(config)).toEqual(first.toSamples(config))
    expect(first.toSamples(config)).not.toEqual(second.toSamples(config))
  })

  it('recalculates formula distributions reproducibly for the same workbook seed', () => {
    const buildEngine = () =>
      HyperFormula.buildFromArray(
        [['N(10, 2)', 'U(2, 4)', '=A1*B1']],
        { simulationSeed: 'simulation-alpha' } as any
      )

    const first = buildEngine().getCellValue(adr('C1')) as SampledDistribution
    const second = buildEngine().getCellValue(adr('C1')) as SampledDistribution

    expect(first.getSamples()).toEqual(second.getSamples())
  })
})
