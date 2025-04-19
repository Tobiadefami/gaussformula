/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {GaussianNumber, SampledDistribution} from './interpreter/InterpreterValue'

import {Config} from './Config'
import {Maybe} from './Maybe'

export class NumberLiteralHelper {
  private readonly numberPattern: RegExp
  private readonly allThousandSeparatorsRegex: RegExp
  private readonly gaussianPattern: RegExp = /^N\s*\(\s*\u03BC\s*=\s*([+-]?\d*\.?\d+)\s*,\s*\u03C3\u00B2\s*=\s*([+-]?\d*\.?\d+)\s*\)$/
  private readonly sampledPattern: RegExp = /^S\[(\d+)\]\(\u03BC=([+-]?\d*\.?\d+),\s*\u03C3\u00B2=([+-]?\d*\.?\d+)\)$/

  constructor(
    private readonly config: Config
  ) {
    const thousandSeparator = this.config.thousandSeparator === '.' ? `\\${this.config.thousandSeparator}` : this.config.thousandSeparator
    const decimalSeparator = this.config.decimalSeparator === '.' ? `\\${this.config.decimalSeparator}` : this.config.decimalSeparator

    this.numberPattern = new RegExp(`^([+-]?((${decimalSeparator}\\d+)|(\\d+(${thousandSeparator}\\d{3,})*(${decimalSeparator}\\d*)?)))(e[+-]?\\d+)?$`)
    this.allThousandSeparatorsRegex = new RegExp(`${thousandSeparator}`, 'g')
  }

  public numericStringToMaybeNumber(input: string): Maybe<number | GaussianNumber | SampledDistribution> {
    const gaussianMatch = this.gaussianPattern.exec(input)
    if (gaussianMatch) {
      const mean = Number(gaussianMatch[1])
      const variance = Number(gaussianMatch[2])
      if (!isNaN(mean) && !isNaN(variance)) {
        return new GaussianNumber(mean, variance)
      }
    }

    const sampledMatch = this.sampledPattern.exec(input)
    if (sampledMatch) {
      const sampleCount = Number(sampledMatch[1])
      const mean = Number(sampledMatch[2])
      const variance = Number(sampledMatch[3])
      if (!isNaN(sampleCount) && !isNaN(mean) && !isNaN(variance)) {
        // Generate samples based on mean and variance
        const samples = Array.from({length: sampleCount}, () => {
          const u1 = Math.random();
          const u2 = Math.random();
          const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
          return mean + Math.sqrt(variance) * z0;
        });
        return new SampledDistribution(samples)
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

  public numericStringToNumber(input: string): number {
    const normalized = input
      .replace(this.allThousandSeparatorsRegex, '')
      .replace(this.config.decimalSeparator, '.')
    return Number(normalized)
  }
}
