/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {Config} from '../Config'
import {CellError, ErrorType} from '../Cell'
import {ErrorMessage} from '../error-message'
import {SimpleRangeValue} from '../SimpleRangeValue'
import {
  DistributionNumber,
  ExtendedNumber,
  getRawValue,
  InternalNoErrorScalarValue,
  InternalScalarValue,
  InterpreterValue,
  isExtendedNumber,
  SampledDistribution,
} from './InterpreterValue'

export type UncertainValue = DistributionNumber | SampledDistribution

/**
 * Returns true for values that carry uncertainty instead of a single deterministic number.
 */
export const isUncertainValue = (value: unknown): value is UncertainValue =>
  value instanceof DistributionNumber || value instanceof SampledDistribution

/**
 * Converts deterministic and uncertain numbers into aligned sample arrays.
 */
export const samplesForValue = (value: ExtendedNumber, config: Config): number[] => {
  if (value instanceof DistributionNumber) {
    return value.toSamples(config)
  }

  if (value instanceof SampledDistribution) {
    return value.getSamples()
  }

  const rawValue = getRawValue(value)
  return Array.from({length: config.sampleSize}, () => rawValue)
}

/**
 * Evaluates one aggregate calculation per simulation trial.
 */
export const sampleAwareAggregate = (
  values: ExtendedNumber[],
  config: Config,
  aggregateSamples: (values: number[]) => number | CellError,
): SampledDistribution | CellError | undefined => {
  if (!values.some(isUncertainValue)) {
    return undefined
  }

  const sampleArrays = values.map((value) => samplesForValue(value, config))
  const sampleCount = Math.max(...sampleArrays.map((samples) => samples.length), config.sampleSize)
  const resultSamples: number[] = []

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
    const samples = sampleArrays.map((sampleArray) => sampleArray[sampleIndex % sampleArray.length])
    const result = aggregateSamples(samples)
    if (result instanceof CellError) {
      return result
    }
    resultSamples.push(result)
  }

  return new SampledDistribution(resultSamples, config)
}

/**
 * Evaluates a scalar boolean result per simulation trial and returns it as a
 * sampled numeric mask of 1 and 0.
 */
export const sampleAwareScalarBooleanResult = (
  values: InternalNoErrorScalarValue[],
  config: Config,
  evaluate: (values: InternalNoErrorScalarValue[]) => boolean | CellError,
): SampledDistribution | CellError | undefined =>
  sampleAwareScalarResult(values, config, (samples) => {
    const result = evaluate(samples)
    if (result instanceof CellError) {
      return result
    }
    return result ? 1 : 0
  })

/**
 * Evaluates a numeric scalar result per simulation trial when any argument is
 * uncertain.
 */
export const sampleAwareScalarNumericResult = (
  values: InternalNoErrorScalarValue[],
  config: Config,
  evaluate: (values: InternalNoErrorScalarValue[]) => number | CellError,
): SampledDistribution | CellError | undefined =>
  sampleAwareScalarResult(values, config, evaluate)

/**
 * Applies a unary numeric transform to each sample when the input is uncertain.
 */
export const sampleAwareUnaryPointwise = (
  value: ExtendedNumber,
  config: Config,
  transform: (value: number) => number | CellError,
): SampledDistribution | CellError | undefined => {
  if (!isUncertainValue(value)) {
    return undefined
  }

  return sampleAwareAggregate([value], config, ([sample]) => validPointwiseResult(transform(sample)))
}

/**
 * Applies a binary numeric transform to aligned samples when any input is uncertain.
 */
export const sampleAwareBinaryPointwise = (
  left: ExtendedNumber,
  right: ExtendedNumber,
  config: Config,
  transform: (left: number, right: number) => number | CellError,
): SampledDistribution | CellError | undefined => {
  return sampleAwareAggregate([left, right], config, ([leftSample, rightSample]) =>
    validPointwiseResult(transform(leftSample, rightSample))
  )
}

/**
 * Applies a ternary numeric transform to aligned samples when any input is uncertain.
 */
export const sampleAwareTernaryPointwise = (
  first: ExtendedNumber,
  second: ExtendedNumber,
  third: ExtendedNumber,
  config: Config,
  transform: (first: number, second: number, third: number) => number | CellError,
): SampledDistribution | CellError | undefined => {
  return sampleAwareAggregate([first, second, third], config, ([firstSample, secondSample, thirdSample]) =>
    validPointwiseResult(transform(firstSample, secondSample, thirdSample))
  )
}

/**
 * Collects numeric values from scalar arguments and ranges using exact range semantics.
 */
export const collectExactUncertaintyValues = (
  args: InterpreterValue[],
  coerceScalar: (arg: InternalScalarValue) => ExtendedNumber | CellError,
): ExtendedNumber[] | CellError => {
  const values: ExtendedNumber[] = []

  for (const arg of args) {
    if (arg instanceof SimpleRangeValue) {
      const rangeValues = collectExactScalarValues(arg.valuesFromTopLeftCorner())
      if (rangeValues instanceof CellError) {
        return rangeValues
      }
      values.push(...rangeValues)
    } else {
      const coerced = coerceScalar(arg)
      if (coerced instanceof CellError) {
        return coerced
      }
      values.push(coerced)
    }
  }

  return values
}

/**
 * Collects exact numeric values and evaluates aggregate logic per simulation trial.
 */
export const sampleAwareExactAggregate = (
  args: InterpreterValue[],
  config: Config,
  coerceScalar: (arg: InternalScalarValue) => ExtendedNumber | CellError,
  aggregateSamples: (values: number[]) => number | CellError,
): SampledDistribution | CellError | undefined => {
  const values = collectExactUncertaintyValues(args, coerceScalar)
  if (values instanceof CellError) {
    return values
  }

  return sampleAwareAggregate(values, config, aggregateSamples)
}

const collectExactScalarValues = (args: InternalScalarValue[]): ExtendedNumber[] | CellError => {
  const values: ExtendedNumber[] = []

  for (const arg of args) {
    if (arg instanceof CellError) {
      return arg
    }
    if (isExtendedNumber(arg)) {
      values.push(arg)
    }
  }

  return values
}

const sampleAwareScalarResult = (
  values: InternalNoErrorScalarValue[],
  config: Config,
  evaluate: (values: InternalNoErrorScalarValue[]) => number | CellError,
): SampledDistribution | CellError | undefined => {
  if (!values.some(isUncertainValue)) {
    return undefined
  }

  const sampleArrays = values.map((value) => sampledScalarsForValue(value, config))
  const sampleCount = Math.max(...sampleArrays.map((samples) => samples.length), config.sampleSize)
  const resultSamples: number[] = []

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
    const samples = sampleArrays.map((sampleArray) => sampleArray[sampleIndex % sampleArray.length])
    const result = evaluate(samples)
    if (result instanceof CellError) {
      return result
    }
    resultSamples.push(result === 0 ? 0 : result)
  }

  return new SampledDistribution(resultSamples, config)
}

const sampledScalarsForValue = (
  value: InternalNoErrorScalarValue,
  config: Config,
): InternalNoErrorScalarValue[] => {
  if (isUncertainValue(value)) {
    return samplesForValue(value, config)
  }

  return Array.from({length: config.sampleSize}, () => value)
}

const validPointwiseResult = (value: number | CellError): number | CellError => {
  if (value instanceof CellError) {
    return value
  }
  if (!Number.isFinite(value)) {
    return new CellError(ErrorType.NUM, ErrorMessage.NaN)
  }

  return value === 0 ? 0 : value
}
