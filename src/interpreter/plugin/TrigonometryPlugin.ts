/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {CellError, ErrorType} from '../../Cell'
import {ErrorMessage} from '../../error-message'
import {ProcedureAst} from '../../parser/Ast'
import {InterpreterState} from '../InterpreterState'
import {InterpreterValue} from '../InterpreterValue'
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
        {argumentType: FunctionArgumentType.NUMBER}
      ]
    },
    'ASIN': {
      method: 'asin',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER}
      ]
    },
    'COS': {
      method: 'cos',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER}
      ]
    },
    'SIN': {
      method: 'sin',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER}
      ]
    },
    'TAN': {
      method: 'tan',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER}
      ]
    },
    'ATAN': {
      method: 'atan',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER}
      ]
    },
    'ATAN2': {
      method: 'atan2',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER},
        {argumentType: FunctionArgumentType.NUMBER},
      ]
    },
    'COT': {
      method: 'cot',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER}
      ]
    },
    'SEC': {
      method: 'sec',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER}
      ]
    },
    'CSC': {
      method: 'csc',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER}
      ]
    },
    'SINH': {
      method: 'sinh',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER}
      ]
    },
    'COSH': {
      method: 'cosh',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER}
      ]
    },
    'TANH': {
      method: 'tanh',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER}
      ]
    },
    'COTH': {
      method: 'coth',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER}
      ]
    },
    'SECH': {
      method: 'sech',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER}
      ]
    },
    'CSCH': {
      method: 'csch',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER}
      ]
    },
    'ACOT': {
      method: 'acot',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER}
      ]
    },
    'ASINH': {
      method: 'asinh',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER}
      ]
    },
    'ACOSH': {
      method: 'acosh',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER}
      ]
    },
    'ATANH': {
      method: 'atanh',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER}
      ]
    },
    'ACOTH': {
      method: 'acoth',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER}
      ]
    },
  }

  /**
   * Corresponds to ACOS(value)
   *
   * Returns the arc cosine (or inverse cosine) of a number.
   *
   * @param ast
   * @param state
   */
  public acos(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('ACOS'), Math.acos)
  }

  public asin(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('ASIN'), Math.asin)
  }

  public cos(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('COS'), Math.cos)
  }

  public sin(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('SIN'), Math.sin)
  }

  public tan(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('TAN'), Math.tan)
  }

  public atan(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('ATAN'), Math.atan)
  }

  public atan2(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('ATAN2'),
      (x: number, y: number) => {
        if (x === 0 && y === 0) {
          return new CellError(ErrorType.DIV_BY_ZERO)
        }
        return Math.atan2(y, x)
      }
    )
  }

  public cot(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('COT'),
      (arg) => (arg === 0) ? new CellError(ErrorType.DIV_BY_ZERO) : (1 / Math.tan(arg))
    )
  }

  public acot(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('ACOT'),
      (arg) => (arg === 0) ? PI / 2 : Math.atan(1 / arg)
    )
  }

  public sec(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('SEC'),
      (arg: number) => 1 / Math.cos(arg)
    )
  }

  public csc(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('CSC'),
      (arg) => (arg === 0) ? new CellError(ErrorType.DIV_BY_ZERO) : (1 / Math.sin(arg))
    )
  }

  public sinh(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('SINH'), Math.sinh)
  }

  public asinh(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('ASINH'), Math.asinh)
  }

  public cosh(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('COSH'), Math.cosh)
  }

  public acosh(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('ACOSH'), Math.acosh)
  }

  public tanh(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('TANH'), Math.tanh)
  }

  public atanh(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('ATANH'), Math.atanh)
  }

  public coth(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('COTH'),
      (arg) => (arg === 0) ? new CellError(ErrorType.DIV_BY_ZERO) : (1 / Math.tanh(arg))
    )
  }

  public acoth(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('ACOTH'),
      (arg) => (arg === 0) ? new CellError(ErrorType.NUM, ErrorMessage.NonZero) : Math.atanh(1 / arg)
    )
  }

  public sech(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('SECH'),
      (arg: number) => 1 / Math.cosh(arg)
    )
  }

  public csch(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('CSCH'),
      (arg) => (arg === 0) ? new CellError(ErrorType.DIV_BY_ZERO) : (1 / Math.sinh(arg))
    )
  }
}
