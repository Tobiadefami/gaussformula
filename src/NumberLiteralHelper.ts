/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {
  ConfidenceIntervalNumber,
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
    | SampledDistribution
    | ConfidenceIntervalNumber
  > {

    // Confidence interval literal - support multiple formats
    // Format 1: CI[20, 50]
    let confidenceIntervalMatch = this.confidenceIntervalPattern.exec(input);
    
    // Format 2: [20, 50] 
    if (!confidenceIntervalMatch) {
      const rangePattern = /^\[\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*\]$/;
      confidenceIntervalMatch = rangePattern.exec(input);
    }
    
    // Format 3: 20 to 50 (range style)
    if (!confidenceIntervalMatch) {
      const rangeToPattern = /^([+-]?\d*\.?\d+)\s+to\s+([+-]?\d*\.?\d+)$/i;
      confidenceIntervalMatch = rangeToPattern.exec(input);
    }
    
    if (confidenceIntervalMatch) {
      const lower = Number(confidenceIntervalMatch[1]);
      const upper = Number(confidenceIntervalMatch[2]);
      if (!isNaN(lower) && !isNaN(upper) && lower <= upper) {
        return new ConfidenceIntervalNumber(lower, upper, 90); // Default to 90%
      }
    }

    // Sampled distribution literal (for results from calculations)
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
