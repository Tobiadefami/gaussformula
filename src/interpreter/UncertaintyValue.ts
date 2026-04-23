/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {Config} from '../Config'
import {CellError} from '../Cell'
import {SimpleRangeValue} from '../SimpleRangeValue'
import {
  DistributionNumber,
  ExtendedNumber,
  getRawValue,
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
