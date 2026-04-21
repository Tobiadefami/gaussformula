export const DEFAULT_SIMULATION_SEED = 'gaussformula-default-simulation-seed-v1'

export type RandomSource = () => number
export type SimulationSeed = string

export function createSeededRandom(seed: SimulationSeed): RandomSource {
  let state = hashSeed(seed)

  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export function createSamplingRandomSource(
  simulationSeed?: SimulationSeed,
  samplingIdentity?: string
): RandomSource {
  const seed = simulationSeed ?? DEFAULT_SIMULATION_SEED
  const identity = samplingIdentity ?? 'unidentified'

  return createSeededRandom(`${seed}:${identity}`)
}

function hashSeed(seed: string): number {
  let hash = 1779033703 ^ seed.length

  for (let i = 0; i < seed.length; i++) {
    hash = Math.imul(hash ^ seed.charCodeAt(i), 3432918353)
    hash = (hash << 13) | (hash >>> 19)
  }

  hash = Math.imul(hash ^ (hash >>> 16), 2246822507)
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909)

  return (hash ^ (hash >>> 16)) >>> 0
}
