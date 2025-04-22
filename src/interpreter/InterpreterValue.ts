/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {CellError} from '../Cell'
import {SimpleRangeValue} from '../SimpleRangeValue'

/**
 * A symbol representing an empty cell value.
 */
export const EmptyValue = Symbol('Empty value')

export type EmptyValueType = typeof EmptyValue
export type InternalNoErrorScalarValue = RichNumber | RawNoErrorScalarValue
export type InternalScalarValue = RichNumber | RawScalarValue
export type InterpreterValue = RichNumber | RawInterpreterValue

export type RawNoErrorScalarValue = number | string | boolean | EmptyValueType
export type RawScalarValue = RawNoErrorScalarValue | CellError
export type RawInterpreterValue = RawScalarValue | SimpleRangeValue

export function getRawValue<T>(num: RichNumber | T): number | T {
  if (num instanceof RichNumber) {
    return num.val
  } else {
    return num
  }
}

export abstract class RichNumber {
  constructor(public val: number,
              public format?: string) {
  }

  public fromNumber(val: number): this {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    return new (this.constructor as any)(val)
  }

  abstract getDetailedType(): NumberType
}

export function cloneNumber(val: ExtendedNumber, newVal: number): ExtendedNumber {
  if (typeof val === 'number') {
    return newVal
  } else {
    const ret = val.fromNumber(newVal)
    ret.format = val.format
    return ret
  }
}

export class DateNumber extends RichNumber {
  public getDetailedType(): NumberType {
    return NumberType.NUMBER_DATE
  }
}

export class CurrencyNumber extends RichNumber {
  public getDetailedType(): NumberType {
    return NumberType.NUMBER_CURRENCY
  }
}

export class TimeNumber extends RichNumber {
  public getDetailedType(): NumberType {
    return NumberType.NUMBER_TIME
  }
}

export class DateTimeNumber extends RichNumber {
  public getDetailedType(): NumberType {
    return NumberType.NUMBER_DATETIME
  }
}

export class PercentNumber extends RichNumber {
  public getDetailedType(): NumberType {
    return NumberType.NUMBER_PERCENT
  }
}

export type ExtendedNumber = number | RichNumber

export function isExtendedNumber(val: any): val is ExtendedNumber {
  return (typeof val === 'number') || (val instanceof RichNumber)
}

export enum NumberType {
  NUMBER_RAW = 'NUMBER_RAW',
  NUMBER_DATE = 'NUMBER_DATE',
  NUMBER_TIME = 'NUMBER_TIME',
  NUMBER_DATETIME = 'NUMBER_DATETIME',
  NUMBER_CURRENCY = 'NUMBER_CURRENCY',
  NUMBER_PERCENT = 'NUMBER_PERCENT',
  NUMBER_GAUSSIAN = 'NUMBER_GAUSSIAN',
  NUMBER_PRODUCT = 'NUMBER_PRODUCT',
  NUMBER_RATIO = 'NUMBER_RATIO'
}

export const getTypeOfExtendedNumber = (value: ExtendedNumber): NumberType => {
  if (value instanceof CurrencyNumber) {
    return NumberType.NUMBER_CURRENCY
  } else if (value instanceof PercentNumber) {
    return NumberType.NUMBER_PERCENT
  } else if (value instanceof DateNumber) {
    return NumberType.NUMBER_DATE
  } else if (value instanceof TimeNumber) {
    return NumberType.NUMBER_TIME
  } else if (value instanceof DateTimeNumber) {
    return NumberType.NUMBER_DATETIME
  } else if (value instanceof GaussianNumber) {
    return NumberType.NUMBER_GAUSSIAN
  } else {
    return NumberType.NUMBER_RAW
  }
}

export type FormatInfo = string | undefined

export function getFormatOfExtendedNumber(num: ExtendedNumber): FormatInfo {
  if (num instanceof RichNumber) {
    return num.format
  } else {
    return undefined
  }
}

export type NumberTypeWithFormat = { type: NumberType, format?: FormatInfo }

export function getTypeFormatOfExtendedNumber(num: ExtendedNumber): NumberTypeWithFormat {
  if (num instanceof RichNumber) {
    return {type: num.getDetailedType(), format: num.format}
  } else {
    return {type: NumberType.NUMBER_RAW}
  }
}

export class ProductDistribution extends RichNumber {
  private readonly samples: number[];

  constructor(samples: number[]) {
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
    return this.samples.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / this.samples.length;
  }

  public getDetailedType(): NumberType {
    return NumberType.NUMBER_PRODUCT;
  }

  public fromNumber(val: number): this {
    const newSamples = this.samples.map(s => s - this.getMean() + val);
    return new ProductDistribution(newSamples) as this;
  }
}

export class GaussianNumber extends RichNumber {
  private samples: number[] | null = null;
  private readonly SAMPLE_SIZE = 10000;

  constructor(public readonly mean: number, public readonly variance: number) {
    super(mean)
    this.generateSamples();
  }

  private generateSamples() {
    this.samples = new Array(this.SAMPLE_SIZE);
    for (let i = 0; i < this.SAMPLE_SIZE; i++) {
      const u1 = Math.random();
      const u2 = Math.random();
      const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      this.samples[i] = this.mean + Math.sqrt(this.variance) * z0;
    }
  }

  public getSamples(): number[] {
    if (!this.samples) {
      this.generateSamples();
    }
    return this.samples!;
  }

  public getDetailedType(): NumberType {
    return NumberType.NUMBER_GAUSSIAN;
  }

  public fromNumber(val: number): this {
    return new GaussianNumber(val, this.variance) as this;
  }

  public static preservesNormality(left: ExtendedNumber, right: ExtendedNumber, operation: string): boolean {
    if (operation === '+' || operation === '-') {
      return true;
    }
    
    if (operation === '*' || operation === '/') {
      return !(left instanceof GaussianNumber && right instanceof GaussianNumber);
    }
    
    return false;
  }
}

export class RatioDistribution extends RichNumber {
  constructor(
    public readonly mean: number,
    public readonly variance: number,
    public readonly sourceMeanX: number,
    public readonly sourceVarX: number,
    public readonly sourceMeanY: number,
    public readonly sourceVarY: number
  ) {
    super(mean);
  }

  public getDetailedType(): NumberType {
    return NumberType.NUMBER_RATIO;
  }

  public fromNumber(val: number): this {
    const meanDiff = val - this.mean;
    return new RatioDistribution(
      val,
      this.variance,
      this.sourceMeanX + meanDiff * this.sourceMeanY,
      this.sourceVarX,
      this.sourceMeanY,
      this.sourceVarY
    ) as this;
  }
}

