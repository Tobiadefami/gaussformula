import {
  createSamplingRandomSource,
  createSeededRandom,
  DEFAULT_SIMULATION_SEED,
} from '../../src/interpreter/RandomSource'

describe('deterministic random sources', () => {
  const take = (random: () => number, count: number): number[] =>
    Array.from({ length: count }, () => random())

  it('creates the same sequence for the same numeric seed', () => {
    expect(take(createSeededRandom(123), 5)).toEqual(
      take(createSeededRandom(123), 5)
    )
  })

  it('creates the same sequence for the same string seed', () => {
    expect(take(createSeededRandom('workbook-alpha'), 5)).toEqual(
      take(createSeededRandom('workbook-alpha'), 5)
    )
  })

  it('creates different streams for different sampling identities', () => {
    const firstStream = createSamplingRandomSource('seed', '0:0:0')
    const secondStream = createSamplingRandomSource('seed', '0:1:0')

    expect(take(firstStream, 5)).not.toEqual(take(secondStream, 5))
  })

  it('uses the documented default simulation seed when no seed is provided', () => {
    expect(take(createSamplingRandomSource(undefined, '0:0:0'), 5)).toEqual(
      take(createSamplingRandomSource(DEFAULT_SIMULATION_SEED, '0:0:0'), 5)
    )
  })
})
