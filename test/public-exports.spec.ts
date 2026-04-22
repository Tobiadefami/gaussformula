import GaussFormulaDefault, {GaussFormula, HyperFormula} from '../src'

describe('public exports', () => {
  it('exports GaussFormula as the primary engine name', () => {
    const engine = GaussFormula.buildEmpty({licenseKey: 'gpl-v3'})

    expect(engine).toBeInstanceOf(GaussFormula)

    engine.destroy()
  })

  it('keeps HyperFormula as a backward-compatible alias', () => {
    expect(GaussFormula).toBe(HyperFormula)
    expect(GaussFormulaDefault.GaussFormula).toBe(GaussFormula)
    expect(GaussFormulaDefault.HyperFormula).toBe(GaussFormula)
  })

  it('does not expose legacy confidence interval objects', () => {
    expect('ConfidenceIntervalNumber' in GaussFormula).toBe(false)
    expect('ConfidenceIntervalNumber' in GaussFormulaDefault).toBe(false)
  })
})
