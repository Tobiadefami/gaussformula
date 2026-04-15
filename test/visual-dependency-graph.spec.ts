import { HyperFormula } from '../src'

describe('HyperFormula.getVisualDependencyGraph', () => {
  it('returns whole-graph cell nodes and directed cell edges for numeric dependencies', () => {
    const engine = HyperFormula.buildEmpty({ licenseKey: 'gpl-v3' })
    engine.addSheet('Sheet1')
    engine.setSheetContent(0, [['1', '2', '=A1+B1', '=C1*2']])

    expect((engine as any).getVisualDependencyGraph()).toEqual({
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
  })

  it('returns structured confidence interval and sampled distribution summaries', () => {
    const engine = HyperFormula.buildEmpty({ licenseKey: 'gpl-v3', sampleSize: 1000 })
    engine.addSheet('Sheet1')
    engine.setSheetContent(0, [['CI[10, 20]', '=A1*2']])

    const graph = (engine as any).getVisualDependencyGraph()

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
})
