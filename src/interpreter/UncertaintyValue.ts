/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {Config} from '../Config'
import {
  DistributionNumber,
  ExtendedNumber,
  getRawValue,
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
