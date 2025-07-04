/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {ProcedureAst} from '../../parser/Ast'
import {InterpreterState} from '../InterpreterState'
import {InterpreterValue} from '../InterpreterValue'
import {FunctionArgumentType, FunctionPlugin, FunctionPluginTypecheck, ImplementedFunctions} from './FunctionPlugin'

export class RadiansPlugin extends FunctionPlugin implements FunctionPluginTypecheck<RadiansPlugin> {
  public static implementedFunctions: ImplementedFunctions = {
    'RADIANS': {
      method: 'radians',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER}
      ],
    },
  }

  public radians(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('RADIANS'),
      (arg) => arg * (Math.PI / 180)
    )
  }
}
