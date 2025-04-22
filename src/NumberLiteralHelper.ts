/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {GaussianNumber, ProductDistribution, RatioDistribution} from './interpreter/InterpreterValue'

import {Config} from './Config'
import {Maybe} from './Maybe'

export class NumberLiteralHelper {
  private readonly numberPattern: RegExp
  private readonly allThousandSeparatorsRegex: RegExp
  private readonly gaussianPattern: RegExp = /^N\s*\(\s*\u03BC\s*=\s*([+-]?\d*\.?\d+)\s*,\s*\u03C3\u00B2\s*=\s*([+-]?\d*\.?\d+)\s*\)$/
  private readonly productPattern: RegExp = /^P\(\u03BC=([+-]?\d*\.?\d+),\s*\u03C3\u00B2=([+-]?\d*\.?\d+)\)$/
  private readonly ratioPattern: RegExp = /^R\(\u03BC=([+-]?\d*\.?\d+),\s*\u03C3\u00B2=([+-]?\d*\.?\d+)\)$/

  constructor(
    private readonly config: Config
  ) {
    const thousandSeparator = this.config.thousandSeparator === '.' ? `\\${this.config.thousandSeparator}` : this.config.thousandSeparator
    const decimalSeparator = this.config.decimalSeparator === '.' ? `\\${this.config.decimalSeparator}` : this.config.decimalSeparator

    this.numberPattern = new RegExp(`^([+-]?((${decimalSeparator}\\d+)|(\\d+(${thousandSeparator}\\d{3,})*(${decimalSeparator}\\d*)?)))(e[+-]?\\d+)?$`)
    this.allThousandSeparatorsRegex = new RegExp(`${thousandSeparator}`, 'g')
  }

  public numericStringToMaybeNumber(input: string): Maybe<number | GaussianNumber | ProductDistribution | RatioDistribution> {
    const gaussianMatch = this.gaussianPattern.exec(input)
    if (gaussianMatch) {
      const mean = Number(gaussianMatch[1])
      const variance = Number(gaussianMatch[2])
      if (!isNaN(mean) && !isNaN(variance)) {
        return new GaussianNumber(mean, variance)
      }
    }

    const productMatch = this.productPattern.exec(input)
    if (productMatch) {
      const mean = Number(productMatch[1])
      const variance = Number(productMatch[2])
      if (!isNaN(mean) && !isNaN(variance)) {
        // Generate samples based on mean and variance
        const samples = Array.from({length: 1000}, () => {
          const u1 = Math.random();
          const u2 = Math.random();
          const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
          return mean + Math.sqrt(variance) * z0;
        });
        return new ProductDistribution(samples)
      }
    }

    const ratioMatch = this.ratioPattern.exec(input)
    if (ratioMatch) {
      const mean = Number(ratioMatch[1])
      const variance = Number(ratioMatch[2])
      if (!isNaN(mean) && !isNaN(variance)) {
        return new RatioDistribution(mean, variance, 0, 0, 0, 0) // Source parameters not needed for parsing
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
