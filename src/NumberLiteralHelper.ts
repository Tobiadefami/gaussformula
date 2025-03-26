/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {Config} from './Config'
import {GaussianNumber} from './interpreter/InterpreterValue'
import {Maybe} from './Maybe'

export class NumberLiteralHelper {
  private readonly numberPattern: RegExp
  private readonly allThousandSeparatorsRegex: RegExp
  private readonly gaussianPattern: RegExp = /^N\s*\(\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*\)$/

  constructor(
    private readonly config: Config
  ) {
    const thousandSeparator = this.config.thousandSeparator === '.' ? `\\${this.config.thousandSeparator}` : this.config.thousandSeparator
    const decimalSeparator = this.config.decimalSeparator === '.' ? `\\${this.config.decimalSeparator}` : this.config.decimalSeparator

    this.numberPattern = new RegExp(`^([+-]?((${decimalSeparator}\\d+)|(\\d+(${thousandSeparator}\\d{3,})*(${decimalSeparator}\\d*)?)))(e[+-]?\\d+)?$`)
    this.allThousandSeparatorsRegex = new RegExp(`${thousandSeparator}`, 'g')
  }

  public numericStringToMaybeNumber(input: string): Maybe<number | GaussianNumber> {
    const gaussianMatch = this.gaussianPattern.exec(input)
    if (gaussianMatch) {
      const mean = Number(gaussianMatch[1])
      const variance = Number(gaussianMatch[2])
      if (!isNaN(mean) && !isNaN(variance)) {
        return new GaussianNumber(mean, variance)
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
