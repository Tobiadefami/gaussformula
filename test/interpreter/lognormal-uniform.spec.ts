import { DistributionNumber, sampleLogNormalDistribution, sampleUniformDistribution } from '../../src/interpreter/InterpreterValue'
import { Config } from '../../src/Config'

describe('Distribution samplers', () => {
  describe('lognormal interpretation', () => {
    const mu = 0
    const variance = 0.25 // sigma = 0.5

    it('generates the configured number of samples from an explicit lognormal distribution', () => {
      const distribution = DistributionNumber.lognormal(mu, 0.5)
      expect(distribution.toSamples().length).toBe(Config.defaultConfig.sampleSize)
    })

    it('sampleLogNormalDistribution helper returns positive values', () => {
      const samples = sampleLogNormalDistribution(mu, variance, 100)
      expect(samples.every((v) => v > 0)).toBe(true)
    })
  })

  describe('uniform interpretation', () => {
    const a = -2
    const b = 4

    it('generates the configured number of samples from an explicit uniform distribution', () => {
      const distribution = DistributionNumber.uniform(a, b)
      expect(distribution.toSamples().length).toBe(Config.defaultConfig.sampleSize)
    })

    it('sampleUniformDistribution helper returns values in range', () => {
      const samples = sampleUniformDistribution(a, b, 100)
      const inRange = samples.every((v) => v >= a && v <= b)
      expect(inRange).toBe(true)
    })
  })
})
