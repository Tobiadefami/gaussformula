/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
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

export class ConfidenceIntervalNumber extends RichNumber {
  public readonly lower: number;
  public readonly upper: number;
  public readonly confidenceLevel: number;

  constructor(
    lower: number,
    upper: number,
    confidenceLevel: number = 95,
    format?: string
  ) {
    // Calculate the mean as the center of the confidence interval
    const mean = (lower + upper) / 2;
    super(mean, format);
    this.lower = lower;
    this.upper = upper;
    this.confidenceLevel = confidenceLevel;
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
      this.format
    ) as this;
  }

  public toGaussian(): GaussianNumber {
    const { mean, variance } = confidenceIntervalToGaussian(
      this.lower,
      this.upper,
      this.confidenceLevel
    );
    return new GaussianNumber(mean, variance);
  }
}

export type ExtendedNumber = number | RichNumber;

export function isExtendedNumber(val: any): val is ExtendedNumber {
  return typeof val === "number" || val instanceof RichNumber;
}

export enum NumberType {
  NUMBER_RAW = "NUMBER_RAW",
  NUMBER_DATE = "NUMBER_DATE",
  NUMBER_TIME = "NUMBER_TIME",
  NUMBER_DATETIME = "NUMBER_DATETIME",
  NUMBER_CURRENCY = "NUMBER_CURRENCY",
  NUMBER_PERCENT = "NUMBER_PERCENT",
  NUMBER_GAUSSIAN = "NUMBER_GAUSSIAN",
  NUMBER_SAMPLED = "NUMBER_SAMPLED",
  NUMBER_CONFIDENCE_INTERVAL = "NUMBER_CONFIDENCE_INTERVAL",
  NUMBER_LOGNORMAL = "NUMBER_LOGNORMAL",
  NUMBER_UNIFORM = "NUMBER_UNIFORM",
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

export function generateLogNormalSamples(
  mean: number,
  variance: number,
  sampleSize: number
): number[] {
  const std = Math.sqrt(variance);
  return Array.from({ length: sampleSize }, () => {
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return Math.exp(mean + std * z0);
  });
}

export function generateUniformSamples(min:number, max:number, sampleSize:number): number[] {
  return Array.from({ length: sampleSize }, () => {
    return Math.random() * (max - min) + min;
  });
}


export function confidenceIntervalToGaussian(
  lower: number,
  upper: number,
  confidenceLevel: number
): { mean: number; variance: number } {
  // Get Z-score for confidence level
  const getZScore = (confidence: number): number => {
    const zScores: { [key: number]: number } = {
      90: 1.645,
      95: 1.96,
      99: 2.576,
    };
    return zScores[confidence] || 1.96; // Default to 95% CI
  };

  const zScore = getZScore(confidenceLevel);
  const mean = (lower + upper) / 2;
  const standardDeviation = (upper - lower) / (2 * zScore);
  const variance = standardDeviation * standardDeviation;

  return { mean, variance };
}

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

  public static preservesNormality(
    left: ExtendedNumber,
    right: ExtendedNumber,
    operation: string
  ): boolean {
    if (operation === "+" || operation === "-") {
      return true;
    }

    if (operation === "*" || operation === "/") {
      return !(
        left instanceof GaussianNumber && right instanceof GaussianNumber
      );
    }

    return false;
  }
}


export class LogNormalNumber extends RichNumber {

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
        this.samples = generateLogNormalSamples(
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
        return NumberType.NUMBER_LOGNORMAL;
    }

    public fromNumber(val: number): this {
        return new LogNormalNumber(val, this.variance, this.config) as this;
    }

}

export class UniformNumber extends RichNumber {

    private samples: number[] | null = null; 
    
    constructor(
        public readonly min: number,
        public readonly max: number,
        private readonly config?: Config
    ) {
        super((min + max) / 2); //mean
        this.generateSamples();
    }

    private generateSamples() {
        this.samples = generateUniformSamples(
            this.min,
            this.max,
            this.config?.sampleSize ?? Config.defaultConfig.sampleSize
        );
    }
    

    public getSamples(): number[] {
        if (!this.samples) {
            this.generateSamples();
        }
        return this.samples!;
    }

    public getDetailedType(): NumberType {
        return NumberType.NUMBER_UNIFORM;
    }

    public fromNumber(val: number): this {
        return new UniformNumber(val, this.max, this.config) as this;
    }
}