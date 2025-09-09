import { LogNormalNumber, UniformNumber, generateLogNormalSamples, generateUniformSamples } from '../../src/interpreter/InterpreterValue'
import { Config } from '../../src/Config'

describe('Distribution Extension – Phase 1', () => {
  describe('LogNormalNumber', () => {
    const mu = 0
    const sigma2 = 0.25 // σ = 0.5

    it('should compute analytic mean correctly', () => {
      const ln = new LogNormalNumber(mu, sigma2)
      const expectedMean = Math.exp(mu + sigma2 / 2)
      expect(ln.getMean()).toBeCloseTo(expectedMean, 10)
    })

    it('should compute analytic variance correctly', () => {
      const ln = new LogNormalNumber(mu, sigma2)
      const expectedVar = (Math.exp(sigma2) - 1) * Math.exp(2 * mu + sigma2)
      expect(ln.getVariance()).toBeCloseTo(expectedVar, 10)
    })

    it('should generate the correct number of samples', () => {
      const ln = new LogNormalNumber(mu, sigma2)
      expect(ln.getSamples().length).toBe(Config.defaultConfig.sampleSize)
    })

    it('generateLogNormalSamples helper returns positive values', () => {
      const samples = generateLogNormalSamples(mu, sigma2, 100)
      expect(samples.every((v) => v > 0)).toBe(true)
    })
  })

  describe('UniformNumber', () => {
    const a = -2
    const b = 4

    it('should compute analytic mean correctly', () => {
      const un = new UniformNumber(a, b)
      const expectedMean = (a + b) / 2
      expect(un.getMean()).toBeCloseTo(expectedMean, 10)
    })

    it('should compute analytic variance correctly', () => {
      const un = new UniformNumber(a, b)
      const expectedVar = Math.pow(b - a, 2) / 12
      expect(un.getVariance()).toBeCloseTo(expectedVar, 10)
    })

    it('should generate the correct number of samples', () => {
      const un = new UniformNumber(a, b)
      expect(un.getSamples().length).toBe(Config.defaultConfig.sampleSize)
    })

    it('generateUniformSamples helper returns values in range', () => {
      const samples = generateUniformSamples(a, b, 100)
      const inRange = samples.every((v) => v >= a && v <= b)
      expect(inRange).toBe(true)
    })
  })
}) 