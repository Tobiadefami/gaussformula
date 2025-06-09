/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {
  GaussianNumber,
  SampledDistribution,
  confidenceIntervalToGaussian,
} from "./interpreter/InterpreterValue";

import { Config } from "./Config";
import { Maybe } from "./Maybe";

export class NumberLiteralHelper {
  private readonly numberPattern: RegExp;
  private readonly allThousandSeparatorsRegex: RegExp;
  private readonly gaussianPattern: RegExp =
    /^N\s*\(\s*\u03BC\s*=\s*([+-]?\d*\.?\d+)\s*,\s*\u03C3\u00B2\s*=\s*([+-]?\d*\.?\d+)\s*\)$/;
  private readonly sampledPattern: RegExp =
    /^S\(\u03BC=([+-]?\d*\.?\d+),\s*\u03C3\u00B2=([+-]?\d*\.?\d+)\)$/;
  private readonly confidenceIntervalPattern: RegExp =
    /^P(\d+)\s*\[\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*\]$/;

  constructor(private readonly config: Config) {
    const thousandSeparator =
      this.config.thousandSeparator === "."
        ? `\\${this.config.thousandSeparator}`
        : this.config.thousandSeparator;
    const decimalSeparator =
      this.config.decimalSeparator === "."
        ? `\\${this.config.decimalSeparator}`
        : this.config.decimalSeparator;

    this.numberPattern = new RegExp(
      `^([+-]?((${decimalSeparator}\\d+)|(\\d+(${thousandSeparator}\\d{3,})*(${decimalSeparator}\\d*)?)))(e[+-]?\\d+)?$`
    );
    this.allThousandSeparatorsRegex = new RegExp(`${thousandSeparator}`, "g");
  }

  public numericStringToMaybeNumber(
    input: string
  ): Maybe<number | GaussianNumber | SampledDistribution> {
    const gaussianMatch = this.gaussianPattern.exec(input);
    if (gaussianMatch) {
      const mean = Number(gaussianMatch[1]);
      const variance = Number(gaussianMatch[2]);
      if (!isNaN(mean) && !isNaN(variance)) {
        return new GaussianNumber(mean, variance, this.config);
      }
    }

    const sampledMatch = this.sampledPattern.exec(input);
    if (sampledMatch) {
      const mean = Number(sampledMatch[1]);
      const variance = Number(sampledMatch[2]);
      if (!isNaN(mean) && !isNaN(variance)) {
        return SampledDistribution.fromMeanAndVariance(
          mean,
          variance,
          this.config
        );
      }
    }

    const confidenceIntervalMatch = this.confidenceIntervalPattern.exec(input);
    if (confidenceIntervalMatch) {
      const confidenceLevel = Number(confidenceIntervalMatch[1]);
      const lower = Number(confidenceIntervalMatch[2]);
      const upper = Number(confidenceIntervalMatch[3]);
      if (
        !isNaN(confidenceLevel) &&
        !isNaN(lower) &&
        !isNaN(upper) &&
        lower <= upper
      ) {
        const { mean, variance } = confidenceIntervalToGaussian(
          lower,
          upper,
          confidenceLevel
        );
        return new GaussianNumber(mean, variance, this.config);
      }
    }

    if (this.numberPattern.test(input)) {
      const num = this.numericStringToNumber(input);
      if (isNaN(num)) {
        return undefined;
      }
      return num;
    }

    return undefined;
  }

  public numericStringToNumber(input: string): number {
    const normalized = input
      .replace(this.allThousandSeparatorsRegex, "")
      .replace(this.config.decimalSeparator, ".");
    return Number(normalized);
  }
}
