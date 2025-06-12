/// <reference types="jest" />

import {adr, detailedError} from '../testUtils'

import {CellValueDetailedType} from '../../src/Cell'
import {ErrorMessage} from '../../src/error-message'
import {ErrorType} from '../../src/Cell'
import {GaussianNumber} from '../../src/interpreter/InterpreterValue'
import {HyperFormula} from '../../src'

declare global {
  namespace jest {
    interface Matchers<R> {
      toEqualError(expected: any): R
    }
  }
}

describe('Gaussian number arithmetic', () => {
  it('parses Gaussian numbers correctly', () => {
    const engine = HyperFormula.buildFromArray([
      ['N(1, 2)', 'N(3, 4)']
    ])
    const value1 = engine.getCellValue(adr('A1'))
    const value2 = engine.getCellValue(adr('B1'))
    
    if (!(value1 instanceof GaussianNumber) || !(value2 instanceof GaussianNumber)) {
      throw new Error('Expected GaussianNumber')
    } 
    expect(value1.mean).toBe(1)
    expect(value1.variance).toBe(2)
    expect(value2.mean).toBe(3)
    expect(value2.variance).toBe(4)
    expect(engine.getCellValueDetailedType(adr('A1'))).toBe(CellValueDetailedType.NUMBER_GAUSSIAN)
    expect(engine.getCellValueDetailedType(adr('B1'))).toBe(CellValueDetailedType.NUMBER_GAUSSIAN)
  })

  it('adds Gaussian numbers correctly', () => {
    const engine = HyperFormula.buildFromArray([
      ['N(1, 2)', 'N(3, 4)', '=A1+B1']
    ])
    const result = engine.getCellValue(adr('C1'))
    if (!(result instanceof GaussianNumber)) {
      throw new Error('Expected GaussianNumber')
    }
    expect(result.mean).toBe(4)
    expect(result.variance).toBe(6)
    expect(engine.getCellValueDetailedType(adr('C1'))).toBe(CellValueDetailedType.NUMBER_GAUSSIAN)
  })

  it('subtracts Gaussian numbers correctly', () => {
    const engine = HyperFormula.buildFromArray([
      ['N(5, 2)', 'N(3, 4)', '=A1-B1']
    ])
    const result = engine.getCellValue(adr('C1'))
    if (!(result instanceof GaussianNumber)) {
      throw new Error('Expected GaussianNumber')
    }
    expect(result.mean).toBe(2)
    expect(result.variance).toBe(6)
    expect(engine.getCellValueDetailedType(adr('C1'))).toBe(CellValueDetailedType.NUMBER_GAUSSIAN)
  })

  it('multiplies Gaussian numbers correctly', () => {
    const engine = HyperFormula.buildFromArray([
      ['N(2, 1)', 'N(3, 2)', '=A1*B1']
    ])
    const result = engine.getCellValue(adr('C1'))
    if (!(result instanceof GaussianNumber)) {
      throw new Error('Expected GaussianNumber')
    }
    expect(result.mean).toBe(6)
    // For multiplication: Var[XY] = Var[X]*Var[Y] + Var[X]*(E[Y])^2 + Var[Y]*(E[X])^2
    // Var[XY] = 1*2 + 1*(3)^2 + 2*(2)^2 = 2 + 9 + 8 = 19
    expect(result.variance).toBe(19)
    expect(engine.getCellValueDetailedType(adr('C1'))).toBe(CellValueDetailedType.NUMBER_GAUSSIAN)
  })

  it('divides Gaussian numbers correctly', () => {
    const engine = HyperFormula.buildFromArray([
      ['N(6, 1)', 'N(2, 1)', '=A1/B1']
    ])
    const result = engine.getCellValue(adr('C1'))
    if (!(result instanceof GaussianNumber)) {
      throw new Error('Expected GaussianNumber')
    }
    expect(result.mean).toBe(3)
    // For division: Var[X/Y] = Var[X]*Var[1/Y] + Var[X]*(E[1/Y])^2 + Var[1/Y]*(E[X])^2
    // Var[1/Y] = Var[Y]/(E[Y])^4 = 1/2^4 = 1/16
    // E[1/Y] = 1/E[Y] = 1/2
    // Var[X/Y] = 1*(1/16) + 1*(1/2)^2 + (1/16)*6^2 = 1/16 + 1/4 + 36/16 = 41/16 ≈ 2.5625
    expect(result.variance).toBe(2.5625)
    expect(engine.getCellValueDetailedType(adr('C1'))).toBe(CellValueDetailedType.NUMBER_GAUSSIAN)
  })

  it('handles division by zero correctly', () => {
    const engine = HyperFormula.buildFromArray([
      ['N(1, 1)', 'N(0, 0)', '=A1/B1']
    ])
    expect(engine.getCellValue(adr('C1'))).toEqualError(detailedError(ErrorType.DIV_BY_ZERO))
  })

  it('handles mixed operations with regular numbers', () => {
    const engine = HyperFormula.buildFromArray([
      ['N(1, 2)', '3', '=A1+B1', '=A1*B1']
    ])
    const sum = engine.getCellValue(adr('C1'))
    const product = engine.getCellValue(adr('D1'))
    if (!(sum instanceof GaussianNumber) || !(product instanceof GaussianNumber)) {
      throw new Error('Expected GaussianNumber')
    }
    expect(sum.mean).toBe(4)
    expect(sum.variance).toBe(2)
    expect(product.mean).toBe(3)
    expect(product.variance).toBe(18)
    expect(engine.getCellValueDetailedType(adr('C1'))).toBe(CellValueDetailedType.NUMBER_GAUSSIAN)
    expect(engine.getCellValueDetailedType(adr('D1'))).toBe(CellValueDetailedType.NUMBER_GAUSSIAN)
  })

  it('handles invalid Gaussian number format', () => {
    const engine = HyperFormula.buildFromArray([
      ['N(1)', 'N(1, 2, 3)', 'N(1, 2)', '=A1+B1']
    ])
    expect(engine.getCellValue(adr('A1'))).toBe('N(1)')
    expect(engine.getCellValue(adr('B1'))).toBe('N(1, 2, 3)')
    
    // This is a valid Gaussian number, so it's parsed correctly
    const gaussianValue = engine.getCellValue(adr('C1'))
    expect(gaussianValue instanceof GaussianNumber).toBe(true)
    if (gaussianValue instanceof GaussianNumber) {
      expect(gaussianValue.mean).toBe(1)
      expect(gaussianValue.variance).toBe(2)
    }
    
    // Check that the error has the correct type
    const errorValue = engine.getCellValue(adr('D1'))
    expect((errorValue as any).type).toBe(ErrorType.VALUE)
  })
}) 