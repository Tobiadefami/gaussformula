/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {ProcedureAst} from '../../parser/Ast'
import {InterpreterState} from '../InterpreterState'
import {InterpreterValue} from '../InterpreterValue'
import {FunctionArgumentType, FunctionPlugin, FunctionPluginTypecheck, ImplementedFunctions} from './FunctionPlugin'

export class BitwiseLogicOperationsPlugin extends FunctionPlugin implements FunctionPluginTypecheck<BitwiseLogicOperationsPlugin> {
  public static implementedFunctions: ImplementedFunctions = {
    'BITAND': {
      method: 'bitand',
      parameters: [
        {argumentType: FunctionArgumentType.INTEGER, minValue: 0},
        {argumentType: FunctionArgumentType.INTEGER, minValue: 0},
      ]
    },
    'BITOR': {
      method: 'bitor',
      parameters: [
        {argumentType: FunctionArgumentType.INTEGER, minValue: 0},
        {argumentType: FunctionArgumentType.INTEGER, minValue: 0},
      ]
    },
    'BITXOR': {
      method: 'bitxor',
      parameters: [
        {argumentType: FunctionArgumentType.INTEGER, minValue: 0},
        {argumentType: FunctionArgumentType.INTEGER, minValue: 0},
      ]
    },
  }

  public bitand(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('BITAND'),
      (left: number, right: number) => left & right
    )
  }

  public bitor(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('BITOR'),
      (left: number, right: number) => left | right
    )
  }

  public bitxor(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('BITXOR'),
      (left: number, right: number) => left ^ right
    )
  }
}
