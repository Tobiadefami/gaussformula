/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import { SimpleCellAddress } from '../Cell'

/**
 * Builds a stable identity for cell-based sampling so repeated evaluations of
 * the same address can reuse the same seeded random sequence.
 */
export function samplingIdentityFromAddress(address: SimpleCellAddress): string {
  return `${address.sheet}:${address.row}:${address.col}`
}
