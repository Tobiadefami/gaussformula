/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

/**
 * ========================================================================
 * InterpreterValue: CI-First Uncertainty Arithmetic Architecture
 * ========================================================================
 * 
 * This module implements a Guesstimate-inspired approach to uncertainty:
 * 
 * INPUT TYPES (what can exist in cells):
 * - ConfidenceIntervalNumber: Primary uncertain type ("10 to 20")
 * - GaussianNumber: Normal distribution N(μ, σ²)  
 * - LogNormalNumber: Log-normal distribution
 * - UniformNumber: Uniform distribution U(a,b)
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
  
  // Input distribution types (what users can enter)
  NUMBER_CONFIDENCE_INTERVAL = "NUMBER_CONFIDENCE_INTERVAL", // Primary uncertain input type
  NUMBER_GAUSSIAN = "NUMBER_GAUSSIAN",
  NUMBER_LOGNORMAL = "NUMBER_LOGNORMAL", 
  NUMBER_UNIFORM = "NUMBER_UNIFORM",
  
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
  } else if (value instanceof GaussianNumber) {
    return NumberType.NUMBER_GAUSSIAN;
  } else if (value instanceof ConfidenceIntervalNumber) {
    return NumberType.NUMBER_CONFIDENCE_INTERVAL;
  } else if (value instanceof LogNormalNumber) {
    return NumberType.NUMBER_LOGNORMAL;
  } else if (value instanceof UniformNumber) {
    return NumberType.NUMBER_UNIFORM;
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

/**
 * LogNormalNumber represents a log-normal distribution backed by underlying Normal(μ, σ²).
 * This is an input distribution type that can be used in formulas.
 * All arithmetic operations convert this to samples for Monte-Carlo computation.
 * 
 * X ~ LogNormal(μ, σ²) ⇔ ln X ~ N(μ, σ²)
 */
export class LogNormalNumber extends RichNumber {
  private samples: number[] | null = null;

  constructor(
    public readonly mu: number,
    public readonly sigma2: number,
    private readonly config?: Config
  ) {
    super(Math.exp(mu + sigma2 / 2)); // mean of log-normal
    this.generateSamples();
  }

  private generateSamples() {
    this.samples = generateLogNormalSamples(
      this.mu,
      this.sigma2,
      this.config?.sampleSize ?? Config.defaultConfig.sampleSize
    );
  }

  public getSamples(): number[] {
    if (!this.samples) {
      this.generateSamples();
    }
    return this.samples!;
  }

  public getMean(): number {
    return this.val;
  }

  public getVariance(): number {
    return (
      (Math.exp(this.sigma2) - 1) * Math.exp(2 * this.mu + this.sigma2)
    );
  }

  public getDetailedType(): NumberType {
    return NumberType.NUMBER_LOGNORMAL;
  }

  public fromNumber(val: number): this {
    const newMu = Math.log(val) - this.sigma2 / 2;
    return new LogNormalNumber(newMu, this.sigma2, this.config) as this;
  }
}

/**
 * UniformNumber represents a continuous uniform distribution U(a,b).
 * This is an input distribution type that can be used in formulas.
 * All arithmetic operations convert this to samples for Monte-Carlo computation.
 */
export class UniformNumber extends RichNumber {
  private samples: number[] | null = null;

  constructor(
    public readonly a: number,
    public readonly b: number,
    private readonly config?: Config
  ) {
    super((a + b) / 2);
    this.generateSamples();
  }

  private generateSamples() {
    this.samples = generateUniformSamples(
      this.a,
      this.b,
      this.config?.sampleSize ?? Config.defaultConfig.sampleSize
    );
  }

  public getSamples(): number[] {
    if (!this.samples) {
      this.generateSamples();
    }
    return this.samples!;
  }

  public getMean(): number {
    return this.val;
  }

  public getVariance(): number {
    return Math.pow(this.b - this.a, 2) / 12;
  }

  public getDetailedType(): NumberType {
    return NumberType.NUMBER_UNIFORM;
  }

  public fromNumber(val: number): this {
    const halfWidth = (this.b - this.a) / 2;
    return new UniformNumber(val - halfWidth, val + halfWidth, this.config) as this;
  }
}


/**
 * Interpretation types for confidence intervals following the Guesstimate approach.
 * - 'normal': Treats bounds as symmetric confidence interval (default)
 * - 'uniform': Treats bounds as hard min/max limits  
 * - 'lognormal': Treats bounds as 5th-95th percentiles (positive values only)
 */
export type CIInterpretation = 'normal' | 'uniform' | 'lognormal';

/**
 * ConfidenceIntervalNumber represents the primary input type for uncertain values.
 * This follows the Guesstimate approach where users enter "low to high" ranges
 * and the system interprets them according to the specified interpretation.
 * 
 * All arithmetic operations convert this to samples via toSamples() method.
 */
export class ConfidenceIntervalNumber extends RichNumber {
  public readonly lower: number;
  public readonly upper: number;
  public readonly confidenceLevel: number;
  public readonly interpretation: CIInterpretation;

  constructor(
    lower: number,
    upper: number,
    confidenceLevel: number = 90, // Default to 90% like Guesstimate
    options?: {
      format?: string;
      interpretation?: CIInterpretation;
    }
  ) {
    // Calculate the mean as the center of the confidence interval
    const mean = (lower + upper) / 2;
    super(mean, options?.format);
    this.lower = lower;
    this.upper = upper;
    this.confidenceLevel = confidenceLevel;
    this.interpretation = options?.interpretation || 'normal';
    
    // For lognormal, require positivity
    if (this.interpretation === 'lognormal' && (lower <= 0 || upper <= 0)) {
      throw new Error('Lognormal interpretation requires positive bounds');
    }
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
   * This is the core of the Guesstimate approach: CI → samples → arithmetic → result
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

/**
 * GaussianNumber represents a normal distribution N(μ, σ²).
 * This is an input distribution type that can be used in formulas.
 * All arithmetic operations convert this to samples for Monte-Carlo computation.
 */
export class GaussianNumber extends RichNumber {
  private samples: number[] | null = null;

  constructor(
    public readonly mean: number,
    public readonly variance: number,
    private readonly config?: Config
  ) {
    super(mean);
    this.generateSamples();
  }

  private generateSamples() {
    this.samples = generateNormalSamples(
      this.mean,
      this.variance,
      this.config?.sampleSize ?? Config.defaultConfig.sampleSize
    );
  }

  public getSamples(): number[] {
    if (!this.samples) {
      this.generateSamples();
    }
    return this.samples!;
  }
  public getMean(): number {
    return this.mean;
  }

  public getVariance(): number {
    return this.variance;
  }
  public getDetailedType(): NumberType {
    return NumberType.NUMBER_GAUSSIAN;
  }

  public fromNumber(val: number): this {
    return new GaussianNumber(val, this.variance, this.config) as this;
  }

}
