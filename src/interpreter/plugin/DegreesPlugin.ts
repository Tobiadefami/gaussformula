/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {ProcedureAst} from '../../parser/Ast'
import {InterpreterState} from '../InterpreterState'
import {InterpreterValue} from '../InterpreterValue'
import {FunctionArgumentType, FunctionPlugin, FunctionPluginTypecheck, ImplementedFunctions} from './FunctionPlugin'

export class DegreesPlugin extends FunctionPlugin implements FunctionPluginTypecheck<DegreesPlugin> {
  public static implementedFunctions: ImplementedFunctions = {
    'DEGREES': {
      method: 'degrees',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER}
      ]
    },
  }

  public degrees(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('DEGREES'),
      (arg) => arg * (180 / Math.PI)
    )
  }
}
