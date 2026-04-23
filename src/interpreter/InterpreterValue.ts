/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

/**
 * Values used by the interpreter, including explicit uncertainty inputs.
 * Uncertain arithmetic is sampled: input distributions become samples, and
 * arithmetic over those samples returns SampledDistribution.
 */

import { CellError } from '../Cell'
import { Config } from '../Config'
import { SimpleRangeValue } from '../SimpleRangeValue'
import { normal } from './plugin/3rdparty/jstat/jstat'
import { createSamplingRandomSource, RandomSource } from './RandomSource'

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
  constructor(
    public val: number,
    public format?: string
  ) {}

  public fromNumber(val: number): this {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    return new (this.constructor as any)(val)
  }

  abstract getDetailedType(): NumberType
}

export function cloneNumber(
  val: ExtendedNumber,
  newVal: number
): ExtendedNumber {
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
  return typeof val === 'number' || val instanceof RichNumber
}

export enum NumberType {
  // Basic scalar types
  NUMBER_RAW = 'NUMBER_RAW',
  NUMBER_DATE = 'NUMBER_DATE',
  NUMBER_TIME = 'NUMBER_TIME',
  NUMBER_DATETIME = 'NUMBER_DATETIME',
  NUMBER_CURRENCY = 'NUMBER_CURRENCY',
  NUMBER_PERCENT = 'NUMBER_PERCENT',
  
  // Explicit input distribution type.
  NUMBER_DISTRIBUTION = 'NUMBER_DISTRIBUTION',
  
  // Output distribution type (arithmetic results only)
  NUMBER_SAMPLED = 'NUMBER_SAMPLED', // Monte-Carlo results
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
  } else if (value instanceof DistributionNumber) {
    return NumberType.NUMBER_DISTRIBUTION
  } else if (value instanceof SampledDistribution) {
    return NumberType.NUMBER_SAMPLED
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

export function getTypeFormatOfExtendedNumber(
  num: ExtendedNumber
): NumberTypeWithFormat {
  if (num instanceof RichNumber) {
    return { type: num.getDetailedType(), format: num.format }
  } else {
    return { type: NumberType.NUMBER_RAW }
  }
}

function sampleStandardNormalBoxMuller(random: RandomSource): number {
  const u1 = Math.max(random(), Number.MIN_VALUE)
  const u2 = random()
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2)
}

export function sampleNormalDistribution(
  mean: number,
  variance: number,
  sampleSize: number,
  random: RandomSource = createSamplingRandomSource()
): number[] {
  const std = Math.sqrt(variance)
  return Array.from({ length: sampleSize }, () => {
    const z0 = sampleStandardNormalBoxMuller(random)
    return mean + std * z0
  })
}

/**
 * Generate samples from a log-normal distribution with given underlying normal parameters.
 *
 * X ~ LogNormal(μ, σ²) ⇔ ln X ~ N(μ, σ²)
 */
export function sampleLogNormalDistribution(
  mu: number,
  variance: number,
  sampleSize: number,
  random: RandomSource = createSamplingRandomSource()
): number[] {
  const normalSamples = sampleNormalDistribution(mu, variance, sampleSize, random)
  return normalSamples.map((x) => Math.exp(x))
}

/**
 * Generate samples from a continuous uniform distribution U(a,b).
 */
export function sampleUniformDistribution(
  a: number,
  b: number,
  sampleSize: number,
  random: RandomSource = createSamplingRandomSource()
): number[] {
  return Array.from({ length: sampleSize }, () => a + (b - a) * random())
}

export type DistributionKind = 'normal' | 'lognormal' | 'uniform'
export type DistributionSource = 'parameters' | 'ci'

export const DEFAULT_CONFIDENCE_LEVEL = 95

type DistributionNumberOptions = {
  format?: string,
  samplingIdentity?: string,
  source?: DistributionSource,
  confidenceLevel?: number,
  lower?: number,
  upper?: number,
}

export function normalizeConfidenceLevel(confidence: number): number {
  return confidence > 0 && confidence < 1 ? confidence * 100 : confidence
}

export function zScoreForConfidence(confidence: number): number {
  const confidenceLevel = normalizeConfidenceLevel(confidence)
  const centralProbability = confidenceLevel / 100
  const upperTailProbability = (1 + centralProbability) / 2
  return normal.inv(upperTailProbability, 0, 1)
}

export class DistributionNumber extends RichNumber {
  public readonly kind: DistributionKind
  public readonly source: DistributionSource
  public readonly samplingIdentity?: string
  public readonly confidenceLevel?: number
  public readonly lower?: number
  public readonly upper?: number
  public readonly mean?: number
  public readonly variance?: number
  public readonly mu?: number
  public readonly sigma?: number
  public readonly min?: number
  public readonly max?: number

  private constructor(
    kind: DistributionKind,
    params: {
      mean?: number,
      variance?: number,
      mu?: number,
      sigma?: number,
      min?: number,
      max?: number,
    },
    options?: DistributionNumberOptions
  ) {
    super(DistributionNumber.representativeValue(kind, params), options?.format)
    this.kind = kind
    this.source = options?.source ?? 'parameters'
    this.samplingIdentity = options?.samplingIdentity
    this.confidenceLevel = options?.confidenceLevel
    this.lower = options?.lower
    this.upper = options?.upper
    this.mean = params.mean
    this.variance = params.variance
    this.mu = params.mu
    this.sigma = params.sigma
    this.min = params.min
    this.max = params.max
  }

  public static normal(
    mean: number,
    variance: number,
    options?: DistributionNumberOptions
  ): DistributionNumber {
    return new DistributionNumber('normal', { mean, variance }, options)
  }

  public static lognormal(
    mu: number,
    sigma: number,
    options?: DistributionNumberOptions
  ): DistributionNumber {
    return new DistributionNumber('lognormal', { mu, sigma }, options)
  }

  public static uniform(
    min: number,
    max: number,
    options?: DistributionNumberOptions
  ): DistributionNumber {
    return new DistributionNumber('uniform', { min, max }, options)
  }

  public static normalFromCI(
    lower: number,
    upper: number,
    confidence: number = DEFAULT_CONFIDENCE_LEVEL,
    options?: DistributionNumberOptions
  ): DistributionNumber {
    const confidenceLevel = normalizeConfidenceLevel(confidence)
    const zScore = zScoreForConfidence(confidenceLevel)
    const mean = (lower + upper) / 2
    const std = (upper - lower) / (2 * zScore)
    return DistributionNumber.normal(mean, std * std, {
      ...options,
      source: 'ci',
      lower,
      upper,
      confidenceLevel,
    })
  }

  public static lognormalFromCI(
    lower: number,
    upper: number,
    confidence: number = DEFAULT_CONFIDENCE_LEVEL,
    options?: DistributionNumberOptions
  ): DistributionNumber {
    const confidenceLevel = normalizeConfidenceLevel(confidence)
    const zScore = zScoreForConfidence(confidenceLevel)
    const lnLower = Math.log(lower)
    const lnUpper = Math.log(upper)
    const mu = (lnLower + lnUpper) / 2
    const sigma = (lnUpper - lnLower) / (2 * zScore)
    return DistributionNumber.lognormal(mu, sigma, {
      ...options,
      source: 'ci',
      lower,
      upper,
      confidenceLevel,
    })
  }

  public getDetailedType(): NumberType {
    return NumberType.NUMBER_DISTRIBUTION
  }

  public fromNumber(val: number): this {
    if (val === this.val) {
      switch (this.kind) {
        case 'normal':
          return DistributionNumber.normal(this.mean ?? this.val, this.variance ?? 0, this.copyOptions(this.samplingIdentity)) as this
        case 'lognormal':
          return DistributionNumber.lognormal(this.mu ?? 0, this.sigma ?? 0, this.copyOptions(this.samplingIdentity)) as this
        case 'uniform':
          return DistributionNumber.uniform(this.min ?? this.val, this.max ?? this.val, this.copyOptions(this.samplingIdentity)) as this
      }
    }

    switch (this.kind) {
      case 'normal':
        return DistributionNumber.normal(val, this.variance ?? 0, {
          format: this.format,
          samplingIdentity: this.samplingIdentity,
          source: this.source,
          confidenceLevel: this.confidenceLevel,
          lower: this.lower,
          upper: this.upper,
        }) as this
      case 'lognormal':
        return DistributionNumber.lognormal(Math.log(Math.max(val, Number.MIN_VALUE)), this.sigma ?? 0, {
          format: this.format,
          samplingIdentity: this.samplingIdentity,
          source: this.source,
          confidenceLevel: this.confidenceLevel,
          lower: this.lower,
          upper: this.upper,
        }) as this
      case 'uniform': {
        const currentCenter = ((this.min ?? 0) + (this.max ?? 0)) / 2
        const delta = val - currentCenter
        return DistributionNumber.uniform((this.min ?? 0) + delta, (this.max ?? 0) + delta, {
          format: this.format,
          samplingIdentity: this.samplingIdentity,
          source: this.source,
          confidenceLevel: this.confidenceLevel,
          lower: this.lower,
          upper: this.upper,
        }) as this
      }
    }
  }

  public withSamplingIdentity(samplingIdentity: string): DistributionNumber {
    switch (this.kind) {
      case 'normal':
        return DistributionNumber.normal(this.mean ?? this.val, this.variance ?? 0, this.copyOptions(samplingIdentity))
      case 'lognormal':
        return DistributionNumber.lognormal(this.mu ?? 0, this.sigma ?? 0, this.copyOptions(samplingIdentity))
      case 'uniform':
        return DistributionNumber.uniform(this.min ?? this.val, this.max ?? this.val, this.copyOptions(samplingIdentity))
    }
  }

  public toSamples(config?: Config): number[] {
    const sampleSize = config?.sampleSize || Config.defaultConfig.sampleSize
    const random = createSamplingRandomSource(
      config?.simulationSeed,
      this.samplingIdentity
    )

    switch (this.kind) {
      case 'normal':
        return sampleNormalDistribution(this.mean ?? 0, this.variance ?? 0, sampleSize, random)
      case 'lognormal': {
        const sigma = this.sigma ?? 0
        return sampleLogNormalDistribution(this.mu ?? 0, sigma * sigma, sampleSize, random)
      }
      case 'uniform':
        return sampleUniformDistribution(this.min ?? 0, this.max ?? 0, sampleSize, random)
    }
  }

  private copyOptions(samplingIdentity?: string): DistributionNumberOptions {
    return {
      format: this.format,
      samplingIdentity,
      source: this.source,
      confidenceLevel: this.confidenceLevel,
      lower: this.lower,
      upper: this.upper,
    }
  }

  private static representativeValue(
    kind: DistributionKind,
    params: {
      mean?: number,
      variance?: number,
      mu?: number,
      sigma?: number,
      min?: number,
      max?: number,
    }
  ): number {
    switch (kind) {
      case 'normal':
        return params.mean ?? 0
      case 'lognormal': {
        const mu = params.mu ?? 0
        const sigma = params.sigma ?? 0
        return Math.exp(mu + (sigma * sigma) / 2)
      }
      case 'uniform':
        return ((params.min ?? 0) + (params.max ?? 0)) / 2
    }
  }
}


/**
 * SampledDistribution represents the result of Monte-Carlo arithmetic operations.
 * While users cannot directly input SampledDistribution values, they can exist in cells
 * from previous calculations and be used in further arithmetic operations.
 */
export class SampledDistribution extends RichNumber {
  private readonly samples: number[]

  constructor(
    samples: number[],
    private readonly config?: Config
  ) {
    super(0)
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length
    this.val = mean
    this.samples = samples
  }

  public getSamples(): number[] {
    return this.samples
  }

  public getMean(): number {
    return this.val
  }

  public getVariance(): number {
    const mean = this.getMean()
    return (
      this.samples.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
      this.samples.length
    )
  }

  public getDetailedType(): NumberType {
    return NumberType.NUMBER_SAMPLED
  }

  public fromNumber(val: number): this {
    const newSamples = this.samples.map((s) => s - this.getMean() + val)
    return new SampledDistribution(newSamples, this.config) as this
  }

  public static fromMeanAndVariance(
    mean: number,
    variance: number,
    config?: Config
  ): SampledDistribution {
    const samples = sampleNormalDistribution(
      mean,
      variance,
      config?.sampleSize ?? Config.defaultConfig.sampleSize,
      createSamplingRandomSource(config?.simulationSeed)
    )
    return new SampledDistribution(samples, config)
  }
}
