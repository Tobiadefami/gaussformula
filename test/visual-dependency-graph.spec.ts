import { ConfidenceIntervalNumber, GaussFormula } from '../src'
import type { VisualDependencyGraph } from '../src'

describe('GaussFormula.getVisualDependencyGraph', () => {
  it('returns whole-graph cell nodes and directed cell edges for numeric dependencies', () => {
    const engine = GaussFormula.buildFromArray([['1', '2', '=A1+B1', '=C1*2', '5']])

    const graph: VisualDependencyGraph = engine.getVisualDependencyGraph()

    expect(graph).toEqual({
      nodes: expect.arrayContaining([
        expect.objectContaining({
          id: '0:0:0',
          sheet: 0,
          row: 0,
          col: 0,
          address: 'A1',
          formula: undefined,
          value: { kind: 'scalar', value: 1 },
        }),
        expect.objectContaining({
          id: '0:0:1',
          sheet: 0,
          row: 0,
          col: 1,
          address: 'B1',
          formula: undefined,
          value: { kind: 'scalar', value: 2 },
        }),
        expect.objectContaining({
          id: '0:0:2',
          sheet: 0,
          row: 0,
          col: 2,
          address: 'C1',
          formula: '=A1+B1',
          value: { kind: 'scalar', value: 3 },
        }),
        expect.objectContaining({
          id: '0:0:3',
          sheet: 0,
          row: 0,
          col: 3,
          address: 'D1',
          formula: '=C1*2',
          value: { kind: 'scalar', value: 6 },
        }),
      ]),
      edges: expect.arrayContaining([
        { sourceId: '0:0:0', targetId: '0:0:2' },
        { sourceId: '0:0:1', targetId: '0:0:2' },
        { sourceId: '0:0:2', targetId: '0:0:3' },
      ]),
    })

    expect(graph.nodes.some((node) => node.address === 'E1')).toBe(false)
  })

  it('returns structured confidence interval and sampled distribution summaries', () => {
    const engine = GaussFormula.buildFromArray([['CI[10, 20]', '=A1*2']], {
      sampleSize: 1000,
    })

    const graph: VisualDependencyGraph = engine.getVisualDependencyGraph()

    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          address: 'A1',
          value: expect.objectContaining({
            kind: 'confidence_interval',
            lower: 10,
            upper: 20,
            confidenceLevel: 95,
            interpretation: 'normal',
          }),
        }),
        expect.objectContaining({
          address: 'B1',
          value: expect.objectContaining({
            kind: 'sampled_distribution',
            mean: expect.any(Number),
            variance: expect.any(Number),
          }),
        }),
      ]),
    )
  })

  it('preserves programmatic confidence interval interpretations in graph summaries', () => {
    const engine = GaussFormula.buildFromArray([['CI[10, 20]', undefined, undefined, '=A1+B1+C1']], {
      sampleSize: 1000,
    })
    engine.setCellContents(
      { sheet: 0, row: 0, col: 1 },
      new ConfidenceIntervalNumber(10, 20, 95, { interpretation: 'uniform' })
    )
    engine.setCellContents(
      { sheet: 0, row: 0, col: 2 },
      new ConfidenceIntervalNumber(10, 20, 95, { interpretation: 'lognormal' })
    )

    const graph: VisualDependencyGraph = engine.getVisualDependencyGraph()

    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          address: 'A1',
          value: expect.objectContaining({
            kind: 'confidence_interval',
            interpretation: 'normal',
          }),
        }),
        expect.objectContaining({
          address: 'B1',
          value: expect.objectContaining({
            kind: 'confidence_interval',
            interpretation: 'uniform',
          }),
        }),
        expect.objectContaining({
          address: 'C1',
          value: expect.objectContaining({
            kind: 'confidence_interval',
            interpretation: 'lognormal',
          }),
        }),
      ]),
    )
  })

  it('does not attribute spill aliases as separate dependency sources', () => {
    const engine = GaussFormula.buildFromArray([['={1,2}', undefined, '=B1']])

    const graph = engine.getVisualDependencyGraph()

    expect(graph.nodes.map((node) => node.address)).toEqual(
      expect.arrayContaining(['A1', 'C1']),
    )
    expect(graph.nodes.map((node) => node.address)).not.toContain('B1')
    expect(graph.edges).toContainEqual({ sourceId: '0:0:0', targetId: '0:0:2' })
    expect(graph.edges).not.toContainEqual({ sourceId: '0:0:1', targetId: '0:0:2' })
  })
})
