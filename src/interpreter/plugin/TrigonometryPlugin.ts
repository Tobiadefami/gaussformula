/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {CellError, ErrorType} from '../../Cell'
import {ErrorMessage} from '../../error-message'
import {ProcedureAst} from '../../parser/Ast'
import {InterpreterState} from '../InterpreterState'
import {ExtendedNumber, getRawValue, InterpreterValue} from '../InterpreterValue'
import {sampleAwareBinaryPointwise, sampleAwareUnaryPointwise} from '../UncertaintyValue'
import {FunctionArgumentType, FunctionPlugin, FunctionPluginTypecheck, ImplementedFunctions} from './FunctionPlugin'
import {PI} from './MathConstantsPlugin'

/**
 * Interpreter plugin containing trigonometric functions
 */
export class TrigonometryPlugin extends FunctionPlugin implements FunctionPluginTypecheck<TrigonometryPlugin> {

  public static implementedFunctions: ImplementedFunctions = {
    'ACOS': {
      method: 'acos',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true}
      ]
    },
    'ASIN': {
      method: 'asin',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true}
      ]
    },
    'COS': {
      method: 'cos',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true}
      ]
    },
    'SIN': {
      method: 'sin',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true}
      ]
    },
    'TAN': {
      method: 'tan',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true}
      ]
    },
    'ATAN': {
      method: 'atan',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true}
      ]
    },
    'ATAN2': {
      method: 'atan2',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true},
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true},
      ]
    },
    'COT': {
      method: 'cot',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true}
      ]
    },
    'SEC': {
      method: 'sec',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true}
      ]
    },
    'CSC': {
      method: 'csc',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true}
      ]
    },
    'SINH': {
      method: 'sinh',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true}
      ]
    },
    'COSH': {
      method: 'cosh',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true}
      ]
    },
    'TANH': {
      method: 'tanh',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true}
      ]
    },
    'COTH': {
      method: 'coth',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true}
      ]
    },
    'SECH': {
      method: 'sech',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true}
      ]
    },
    'CSCH': {
      method: 'csch',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true}
      ]
    },
    'ACOT': {
      method: 'acot',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true}
      ]
    },
    'ASINH': {
      method: 'asinh',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true}
      ]
    },
    'ACOSH': {
      method: 'acosh',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true}
      ]
    },
    'ATANH': {
      method: 'atanh',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true}
      ]
    },
    'ACOTH': {
      method: 'acoth',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true}
      ]
    },
  }

  /**
   * Corresponds to ACOS(value)
   *
   * Returns the arc cosine (or inverse cosine) of a number.
   * @param ast
   * @param state
   */
  public acos(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runUnaryPointwise(ast, state, 'ACOS', Math.acos)
  }

  public asin(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runUnaryPointwise(ast, state, 'ASIN', Math.asin)
  }

  public cos(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runUnaryPointwise(ast, state, 'COS', Math.cos)
  }

  public sin(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runUnaryPointwise(ast, state, 'SIN', Math.sin)
  }

  public tan(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runUnaryPointwise(ast, state, 'TAN', Math.tan)
  }

  public atan(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runUnaryPointwise(ast, state, 'ATAN', Math.atan)
  }

  public atan2(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runBinaryPointwise(ast, state, 'ATAN2',
      (x: number, y: number) => {
        if (x === 0 && y === 0) {
          return new CellError(ErrorType.DIV_BY_ZERO)
        }
        return Math.atan2(y, x)
      }
    )
  }

  public cot(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runUnaryPointwise(ast, state, 'COT',
      (arg) => (arg === 0) ? new CellError(ErrorType.DIV_BY_ZERO) : (1 / Math.tan(arg))
    )
  }

  public acot(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runUnaryPointwise(ast, state, 'ACOT',
      (arg) => (arg === 0) ? PI / 2 : Math.atan(1 / arg)
    )
  }

  public sec(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runUnaryPointwise(ast, state, 'SEC',
      (arg: number) => 1 / Math.cos(arg)
    )
  }

  public csc(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runUnaryPointwise(ast, state, 'CSC',
      (arg) => (arg === 0) ? new CellError(ErrorType.DIV_BY_ZERO) : (1 / Math.sin(arg))
    )
  }

  public sinh(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runUnaryPointwise(ast, state, 'SINH', Math.sinh)
  }

  public asinh(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runUnaryPointwise(ast, state, 'ASINH', Math.asinh)
  }

  public cosh(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runUnaryPointwise(ast, state, 'COSH', Math.cosh)
  }

  public acosh(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runUnaryPointwise(ast, state, 'ACOSH', Math.acosh)
  }

  public tanh(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runUnaryPointwise(ast, state, 'TANH', Math.tanh)
  }

  public atanh(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runUnaryPointwise(ast, state, 'ATANH', Math.atanh)
  }

  public coth(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runUnaryPointwise(ast, state, 'COTH',
      (arg) => (arg === 0) ? new CellError(ErrorType.DIV_BY_ZERO) : (1 / Math.tanh(arg))
    )
  }

  public acoth(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runUnaryPointwise(ast, state, 'ACOTH',
      (arg) => (arg === 0) ? new CellError(ErrorType.NUM, ErrorMessage.NonZero) : Math.atanh(1 / arg)
    )
  }

  public sech(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runUnaryPointwise(ast, state, 'SECH',
      (arg: number) => 1 / Math.cosh(arg)
    )
  }

  public csch(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runUnaryPointwise(ast, state, 'CSCH',
      (arg) => (arg === 0) ? new CellError(ErrorType.DIV_BY_ZERO) : (1 / Math.sinh(arg))
    )
  }

  private runUnaryPointwise(
    ast: ProcedureAst,
    state: InterpreterState,
    metadataName: string,
    transform: (value: number) => number | CellError,
  ): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata(metadataName), (value: ExtendedNumber) =>
      sampleAwareUnaryPointwise(value, this.config, transform) ?? transform(getRawValue(value))
    )
  }

  private runBinaryPointwise(
    ast: ProcedureAst,
    state: InterpreterState,
    metadataName: string,
    transform: (left: number, right: number) => number | CellError,
  ): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata(metadataName), (left: ExtendedNumber, right: ExtendedNumber) =>
      sampleAwareBinaryPointwise(left, right, this.config, transform) ?? transform(getRawValue(left), getRawValue(right))
    )
  }
}
