/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

/**
 * ========================================================================
 * InterpreterValue: CI-First Uncertainty Arithmetic Architecture
 * ========================================================================
 * 
 * This module implements uncertainty arithmetic using confidence intervals:
 * 
 * INPUT TYPES (what can exist in cells):
 * - ConfidenceIntervalNumber: Only uncertain input type ("10 to 20", "[10, 20]", "CI[10, 20]")
 * - SampledDistribution: Results from Monte-Carlo operations (can be used in further operations)
 * - Scalars: Regular numbers, strings, booleans
 * 
 * RETURN TYPE (primary arithmetic results):
 * - SampledDistribution: Results from Monte-Carlo operations
 * 
 * CORE PRINCIPLE:
 * All uncertain arithmetic uses sampling (Monte-Carlo) approach:
 * Input → Samples → Element-wise operations → SampledDistribution result
 * 
 * No closed-form distribution arithmetic - sampling is the source of truth.
 */

import { CellError } from "../Cell";
import { Config } from "../Config";
import { SimpleRangeValue } from "../SimpleRangeValue";

/**
 * A symbol representing an empty cell value.
 */
export const EmptyValue = Symbol("Empty value");

export type EmptyValueType = typeof EmptyValue;
export type InternalNoErrorScalarValue = RichNumber | RawNoErrorScalarValue;
export type InternalScalarValue = RichNumber | RawScalarValue;
export type InterpreterValue = RichNumber | RawInterpreterValue;

export type RawNoErrorScalarValue = number | string | boolean | EmptyValueType;
export type RawScalarValue = RawNoErrorScalarValue | CellError;
export type RawInterpreterValue = RawScalarValue | SimpleRangeValue;

export function getRawValue<T>(num: RichNumber | T): number | T {
  if (num instanceof RichNumber) {
    return num.val;
  } else {
    return num;
  }
}

export abstract class RichNumber {
  constructor(
    public val: number,
    public format?: string
  ) {}

  public fromNumber(val: number): this {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    return new (this.constructor as any)(val);
  }

  abstract getDetailedType(): NumberType;
}

export function cloneNumber(
  val: ExtendedNumber,
  newVal: number
): ExtendedNumber {
  if (typeof val === "number") {
    return newVal;
  } else {
    const ret = val.fromNumber(newVal);
    ret.format = val.format;
    return ret;
  }
}

export class DateNumber extends RichNumber {
  public getDetailedType(): NumberType {
    return NumberType.NUMBER_DATE;
  }
}

export class CurrencyNumber extends RichNumber {
  public getDetailedType(): NumberType {
    return NumberType.NUMBER_CURRENCY;
  }
}

export class TimeNumber extends RichNumber {
  public getDetailedType(): NumberType {
    return NumberType.NUMBER_TIME;
  }
}

export class DateTimeNumber extends RichNumber {
  public getDetailedType(): NumberType {
    return NumberType.NUMBER_DATETIME;
  }
}

export class PercentNumber extends RichNumber {
  public getDetailedType(): NumberType {
    return NumberType.NUMBER_PERCENT;
  }
}


export type ExtendedNumber = number | RichNumber;

export function isExtendedNumber(val: any): val is ExtendedNumber {
  return typeof val === "number" || val instanceof RichNumber;
}

export enum NumberType {
  // Basic scalar types
  NUMBER_RAW = "NUMBER_RAW",
  NUMBER_DATE = "NUMBER_DATE",
  NUMBER_TIME = "NUMBER_TIME",
  NUMBER_DATETIME = "NUMBER_DATETIME",
  NUMBER_CURRENCY = "NUMBER_CURRENCY",
  NUMBER_PERCENT = "NUMBER_PERCENT",
  
  // Single input distribution type (what users can enter)
  NUMBER_CONFIDENCE_INTERVAL = "NUMBER_CONFIDENCE_INTERVAL", // Only uncertain input type
  
  // Output distribution type (arithmetic results only)
  NUMBER_SAMPLED = "NUMBER_SAMPLED", // Monte-Carlo results
}

export const getTypeOfExtendedNumber = (value: ExtendedNumber): NumberType => {
  if (value instanceof CurrencyNumber) {
    return NumberType.NUMBER_CURRENCY;
  } else if (value instanceof PercentNumber) {
    return NumberType.NUMBER_PERCENT;
  } else if (value instanceof DateNumber) {
    return NumberType.NUMBER_DATE;
  } else if (value instanceof TimeNumber) {
    return NumberType.NUMBER_TIME;
  } else if (value instanceof DateTimeNumber) {
    return NumberType.NUMBER_DATETIME;
  } else if (value instanceof ConfidenceIntervalNumber) {
    return NumberType.NUMBER_CONFIDENCE_INTERVAL;
  } else if (value instanceof SampledDistribution) {
    return NumberType.NUMBER_SAMPLED;
  } else {
    return NumberType.NUMBER_RAW;
  }
};

export type FormatInfo = string | undefined;

export function getFormatOfExtendedNumber(num: ExtendedNumber): FormatInfo {
  if (num instanceof RichNumber) {
    return num.format;
  } else {
    return undefined;
  }
}

export type NumberTypeWithFormat = { type: NumberType; format?: FormatInfo };

export function getTypeFormatOfExtendedNumber(
  num: ExtendedNumber
): NumberTypeWithFormat {
  if (num instanceof RichNumber) {
    return { type: num.getDetailedType(), format: num.format };
  } else {
    return { type: NumberType.NUMBER_RAW };
  }
}

export function generateNormalSamples(
  mean: number,
  variance: number,
  sampleSize: number
): number[] {
  const std = Math.sqrt(variance);
  return Array.from({ length: sampleSize }, () => {
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + std * z0;
  });
}

/**
 * Generate samples from a log-normal distribution with given underlying normal parameters.
 *
 * X ~ LogNormal(μ, σ²) ⇔ ln X ~ N(μ, σ²)
 */
export function generateLogNormalSamples(
  mu: number,
  sigma2: number,
  sampleSize: number
): number[] {
  const normalSamples = generateNormalSamples(mu, sigma2, sampleSize);
  return normalSamples.map((x) => Math.exp(x));
}

/**
 * Generate samples from a continuous uniform distribution U(a,b).
 */
export function generateUniformSamples(
  a: number,
  b: number,
  sampleSize: number
): number[] {
  return Array.from({ length: sampleSize }, () => a + (b - a) * Math.random());
}

// LogNormalNumber removed - no longer used as input type in unified CI approach

// UniformNumber removed - no longer used as input type in unified CI approach


/**
 * Interpretation types for confidence intervals.
 * - 'normal': Treats bounds as symmetric confidence interval (default)
 * - 'uniform': Treats bounds as hard min/max limits  
 * - 'lognormal': Treats bounds as 5th-95th percentiles (positive values only)
 * - 'auto': Automatically detect best interpretation based on range characteristics
 */
export type CIInterpretation = 'normal' | 'uniform' | 'lognormal' | 'auto';

/**
 * Source format tracking for display purposes
 */
export type CISourceFormat = 'range' | 'normal' | 'lognormal' | 'uniform';

/**
 * ConfidenceIntervalNumber represents the primary input type for uncertain values.
 * Users enter "low to high" ranges
 * and the system interprets them according to the specified interpretation.
 * 
 * All arithmetic operations convert this to samples via toSamples() method.
 */
export class ConfidenceIntervalNumber extends RichNumber {
  public readonly lower: number;
  public readonly upper: number;
  public readonly confidenceLevel: number;
  public readonly interpretation: CIInterpretation;
  public readonly sourceFormat: CISourceFormat;

  constructor(
    lower: number,
    upper: number,
    confidenceLevel: number = 90, // Default to 90%
    options?: {
      format?: string;
      interpretation?: CIInterpretation;
      sourceFormat?: CISourceFormat;
    }
  ) {
    // Initialize with a temporary value - we'll set the correct median after setting properties
    super(0, options?.format);
    this.lower = lower;
    this.upper = upper;
    this.confidenceLevel = confidenceLevel;
    this.sourceFormat = options?.sourceFormat || 'range';
    
    // Handle auto-detection of interpretation
    const requestedInterpretation = options?.interpretation || 'auto';
    this.interpretation = requestedInterpretation === 'auto' 
      ? this.detectInterpretation(lower, upper)
      : requestedInterpretation;
    
    // For lognormal, require positivity
    if (this.interpretation === 'lognormal' && (lower <= 0 || upper <= 0)) {
      // Fall back to normal if lognormal is not possible
      (this as any).interpretation = 'normal';
    }
    
    // Set the correct median value based on interpretation
    this.val = this.getMedian();
  }

  /**
   * Auto-detect the best interpretation based on range characteristics
   */
  private detectInterpretation(lower: number, upper: number): CIInterpretation {
    // If either bound is negative or zero, use normal
    if (lower <= 0) {
      return 'normal';
    }
    
    // For positive ranges, check the ratio to decide between normal and lognormal
    const ratio = upper / lower;
    
    // If the range spans more than 2x (e.g., [20, 50] = 2.5x), use lognormal
    // This captures multiplicative/proportional uncertainty better
    if (ratio >= 2) {
      return 'lognormal';
    }
    
    // For narrow positive ranges, use normal
    return 'normal';
  }

  public getLower(): number {
    return this.lower;
  }

  public getUpper(): number {
    return this.upper;
  }

  public getConfidenceLevel(): number {
    return this.confidenceLevel;
  }

  /**
   * Get the median value of this confidence interval.
   * This is what should be displayed prominently.
   */
  public getMedian(): number {
    switch (this.interpretation) {
      case 'lognormal':
        // For log-normal: median = geometric mean of bounds
        return Math.sqrt(this.lower * this.upper);
      case 'uniform':
      case 'normal':
      default:
        // For normal/uniform: median = arithmetic mean
        return (this.lower + this.upper) / 2;
    }
  }

  public getDetailedType(): NumberType {
    return NumberType.NUMBER_CONFIDENCE_INTERVAL;
  }

  public fromNumber(val: number): this {
    // When creating a new confidence interval from a number,
    // we need to maintain the same width and confidence level
    const width = this.upper - this.lower;
    const newLower = val - width / 2;
    const newUpper = val + width / 2;
    return new ConfidenceIntervalNumber(
      newLower,
      newUpper,
      this.confidenceLevel,
      {
        format: this.format,
        interpretation: this.interpretation
      }
    ) as this;
  }
  
  /**
   * Generate samples according to the interpretation of this confidence interval.
   * This is the core approach: CI → samples → arithmetic → result
   */
  public toSamples(config?: Config): number[] {
    const sampleSize = config?.sampleSize || Config.defaultConfig.sampleSize;
    
    switch (this.interpretation) {
      case 'normal': {
        // Treat lower..upper as symmetric CI around mean
        // For 90% CI: z = 1.645, for 95% CI: z = 1.96
        const zScore = this.getZScoreForConfidence();
        const mean = (this.lower + this.upper) / 2;
        const std = (this.upper - this.lower) / (2 * zScore);
        const variance = std * std;
        return generateNormalSamples(mean, variance, sampleSize);
      }
      
      case 'uniform': {
        // Hard bounds: sample uniformly on [lower, upper]
        return generateUniformSamples(this.lower, this.upper, sampleSize);
      }
      
      case 'lognormal': {
        // Treat lower..upper as 5th & 95th percentiles of lognormal
        // We need to solve for μ and σ of the underlying normal distribution
        // For lognormal: P(X < x) = Φ((ln(x) - μ) / σ)
        // where Φ is the standard normal CDF
        
        // For 5th percentile: Φ((ln(lower) - μ) / σ) = 0.05 → (ln(lower) - μ) / σ = -1.645
        // For 95th percentile: Φ((ln(upper) - μ) / σ) = 0.95 → (ln(upper) - μ) / σ = 1.645
        
        const lnLower = Math.log(this.lower);
        const lnUpper = Math.log(this.upper);
        
        // From the two equations:
        // lnLower = μ - 1.645σ
        // lnUpper = μ + 1.645σ
        // Solving: μ = (lnLower + lnUpper) / 2, σ = (lnUpper - lnLower) / 3.29
        
        const mu = (lnLower + lnUpper) / 2;
        const sigma = (lnUpper - lnLower) / 3.29; // 3.29 = 2 * 1.645
        const sigma2 = sigma * sigma;
        
        return generateLogNormalSamples(mu, sigma2, sampleSize);
      }
      
      default:
        throw new Error(`Unknown interpretation: ${this.interpretation}`);
    }
  }
  
  private getZScoreForConfidence(): number {
    // Common confidence levels and their z-scores
    const zScores: { [key: number]: number } = {
      90: 1.645,
      95: 1.96,
      99: 2.576
    };
    return zScores[this.confidenceLevel] || 1.645; // Default to 90%
  }


}

/**
 * SampledDistribution represents the result of Monte-Carlo arithmetic operations.
 * While users cannot directly input SampledDistribution values, they can exist in cells
 * from previous calculations and be used in further arithmetic operations.
 */
export class SampledDistribution extends RichNumber {
  private readonly samples: number[];

  constructor(
    samples: number[],
    private readonly config?: Config
  ) {
    super(0);
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    this.val = mean;
    this.samples = samples;
  }

  public getSamples(): number[] {
    return this.samples;
  }

  public getMean(): number {
    return this.val;
  }

  public getVariance(): number {
    const mean = this.getMean();
    return (
      this.samples.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
      this.samples.length
    );
  }

  public getDetailedType(): NumberType {
    return NumberType.NUMBER_SAMPLED;
  }

  public fromNumber(val: number): this {
    const newSamples = this.samples.map((s) => s - this.getMean() + val);
    return new SampledDistribution(newSamples, this.config) as this;
  }

  public static fromMeanAndVariance(
    mean: number,
    variance: number,
    config?: Config
  ): SampledDistribution {
    const samples = generateNormalSamples(
      mean,
      variance,
      config?.sampleSize ?? Config.defaultConfig.sampleSize
    );
    return new SampledDistribution(samples, config);
  }
}

