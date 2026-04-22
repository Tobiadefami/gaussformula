/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {
  DistributionNumber,
  SampledDistribution,
} from './interpreter/InterpreterValue'

import { Config } from './Config'
import { Maybe } from './Maybe'

export class NumberLiteralHelper {
  private readonly numberPattern: RegExp
  private readonly allThousandSeparatorsRegex: RegExp
  private readonly sampledPattern: RegExp =
    /^S\(\u03BC=([+-]?\d*\.?\d+),\s*\u03C3\u00B2=([+-]?\d*\.?\d+)\)$/
  private readonly normalPattern: RegExp =
    /^N\s*\(\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*\)$/i
  private readonly lognormalPattern: RegExp =
    /^LN\s*\(\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*\)$/i
  private readonly uniformPattern: RegExp =
    /^U\s*\(\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*\)$/i
  private readonly normalCiPattern: RegExp =
    /^N\.CI\s*\(\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*\)$/i
  private readonly lognormalCiPattern: RegExp =
    /^LN\.CI\s*\(\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*\)$/i

  constructor(private readonly config: Config) {
    const thousandSeparator =
      this.config.thousandSeparator === '.'
        ? `\\${this.config.thousandSeparator}`
        : this.config.thousandSeparator
    const decimalSeparator =
      this.config.decimalSeparator === '.'
        ? `\\${this.config.decimalSeparator}`
        : this.config.decimalSeparator

    this.numberPattern = new RegExp(
      `^([+-]?((${decimalSeparator}\\d+)|(\\d+(${thousandSeparator}\\d{3,})*(${decimalSeparator}\\d*)?)))(e[+-]?\\d+)?$`
    )
    this.allThousandSeparatorsRegex = new RegExp(`${thousandSeparator}`, 'g')
  }

  public numericStringToMaybeNumber(
    input: string
  ): Maybe<
    | number
    | SampledDistribution
    | DistributionNumber
  > {
    const explicitDistribution = this.parseExplicitDistribution(input)
    if (explicitDistribution !== undefined) {
      return explicitDistribution
    }

    // Sampled distribution literal (for results from calculations)
    const sampledMatch = this.sampledPattern.exec(input)
    if (sampledMatch) {
      const mean = Number(sampledMatch[1])
      const variance = Number(sampledMatch[2])
      if (!isNaN(mean) && !isNaN(variance)) {
        return SampledDistribution.fromMeanAndVariance(
          mean,
          variance,
          this.config
        )
      }
    }

    if (this.numberPattern.test(input)) {
      const num = this.numericStringToNumber(input)
      if (isNaN(num)) {
        return undefined
      }
      return num
    }

    return undefined
  }

  private parseExplicitDistribution(input: string): Maybe<DistributionNumber> {
    const normalMatch = this.normalPattern.exec(input)
    if (normalMatch) {
      const mean = Number(normalMatch[1])
      const variance = Number(normalMatch[2])
      if (Number.isFinite(mean) && Number.isFinite(variance) && variance >= 0) {
        return DistributionNumber.normal(mean, variance)
      }
      return undefined
    }

    const lognormalMatch = this.lognormalPattern.exec(input)
    if (lognormalMatch) {
      const mu = Number(lognormalMatch[1])
      const sigma = Number(lognormalMatch[2])
      if (Number.isFinite(mu) && Number.isFinite(sigma) && sigma >= 0) {
        return DistributionNumber.lognormal(mu, sigma)
      }
      return undefined
    }

    const uniformMatch = this.uniformPattern.exec(input)
    if (uniformMatch) {
      const min = Number(uniformMatch[1])
      const max = Number(uniformMatch[2])
      if (Number.isFinite(min) && Number.isFinite(max) && min < max) {
        return DistributionNumber.uniform(min, max)
      }
      return undefined
    }

    const normalCiMatch = this.normalCiPattern.exec(input)
    if (normalCiMatch) {
      const lower = Number(normalCiMatch[1])
      const upper = Number(normalCiMatch[2])
      const confidence = Number(normalCiMatch[3])
      if (this.isValidConfidenceInterval(lower, upper, confidence)) {
        return DistributionNumber.normalFromCI(lower, upper, confidence)
      }
      return undefined
    }

    const lognormalCiMatch = this.lognormalCiPattern.exec(input)
    if (lognormalCiMatch) {
      const lower = Number(lognormalCiMatch[1])
      const upper = Number(lognormalCiMatch[2])
      const confidence = Number(lognormalCiMatch[3])
      if (
        this.isValidConfidenceInterval(lower, upper, confidence) &&
        lower > 0
      ) {
        return DistributionNumber.lognormalFromCI(lower, upper, confidence)
      }
    }

    return undefined
  }

  private isValidConfidenceInterval(
    lower: number,
    upper: number,
    confidence: number
  ): boolean {
    const normalizedConfidence = confidence > 0 && confidence < 1
      ? confidence * 100
      : confidence
    return (
      Number.isFinite(lower) &&
      Number.isFinite(upper) &&
      Number.isFinite(confidence) &&
      lower < upper &&
      normalizedConfidence > 0 &&
      normalizedConfidence < 100
    )
  }

  public numericStringToNumber(input: string): number {
    const normalized = input
      .replace(this.allThousandSeparatorsRegex, '')
      .replace(this.config.decimalSeparator, '.')
    return Number(normalized)
  }
}
