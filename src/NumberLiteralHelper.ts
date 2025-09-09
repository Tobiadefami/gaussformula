/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {
  ConfidenceIntervalNumber,
  GaussianNumber,
  LogNormalNumber, 
  UniformNumber,
  SampledDistribution,
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
    /^CI\s*\[\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*\]$/;

  private readonly logNormalPattern: RegExp =
    /^LN\s*\(\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*\)$/i;

  private readonly uniformPattern: RegExp =
    /^U\s*\(\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*\)$/i;

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
  ): Maybe<
    | number
    | GaussianNumber
    | SampledDistribution
    | ConfidenceIntervalNumber
    | LogNormalNumber
    | UniformNumber
  > {

    // Log-normal literal
    const logMatch = this.logNormalPattern.exec(input);
    if (logMatch) {
      const mu = Number(logMatch[1]);
      const sigma2 = Number(logMatch[2]);
      if (!isNaN(mu) && !isNaN(sigma2)) {
        return new LogNormalNumber(mu, sigma2, this.config);
      }
    }

    // Uniform literal
    const uniMatch = this.uniformPattern.exec(input);
    if (uniMatch) {
      const a = Number(uniMatch[1]);
      const b = Number(uniMatch[2]);
      if (!isNaN(a) && !isNaN(b)) {
        return new UniformNumber(a, b, this.config);
      }
    }

    // Gaussian literal
    const gaussianMatch = this.gaussianPattern.exec(input);
    if (gaussianMatch) {
      const mean = Number(gaussianMatch[1]);
      const variance = Number(gaussianMatch[2]);
      if (!isNaN(mean) && !isNaN(variance)) {
        return new GaussianNumber(mean, variance, this.config);
      }
    }

    // Sampled distribution literal
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

    // Confidence interval literal
    const confidenceIntervalMatch = this.confidenceIntervalPattern.exec(input);
    if (confidenceIntervalMatch) {
      const lower = Number(confidenceIntervalMatch[1]);
      const upper = Number(confidenceIntervalMatch[2]);
      if (!isNaN(lower) && !isNaN(upper) && lower <= upper) {
        return new ConfidenceIntervalNumber(lower, upper, 95);
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
