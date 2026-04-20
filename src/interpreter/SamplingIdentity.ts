import { SimpleCellAddress } from '../Cell'

export function samplingIdentityFromAddress(address: SimpleCellAddress): string {
  return `${address.sheet}:${address.row}:${address.col}`
}
