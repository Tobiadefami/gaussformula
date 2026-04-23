/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {ProcedureAst} from '../../parser/Ast'
import {InterpreterState} from '../InterpreterState'
import {ExtendedNumber, getRawValue, InterpreterValue} from '../InterpreterValue'
import {sampleAwareUnaryPointwise} from '../UncertaintyValue'
import {FunctionArgumentType, FunctionPlugin, FunctionPluginTypecheck, ImplementedFunctions} from './FunctionPlugin'

export class AbsPlugin extends FunctionPlugin implements FunctionPluginTypecheck<AbsPlugin> {
  public static implementedFunctions: ImplementedFunctions = {
    'ABS': {
      method: 'abs',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true}
      ]
    },
  }

  public abs(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('ABS'), (arg: ExtendedNumber) =>
      sampleAwareUnaryPointwise(arg, this.config, Math.abs) ?? Math.abs(getRawValue(arg))
    )
  }
}
