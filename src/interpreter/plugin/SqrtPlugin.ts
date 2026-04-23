/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {ProcedureAst} from '../../parser/Ast'
import {InterpreterState} from '../InterpreterState'
import {ExtendedNumber, getRawValue, InterpreterValue} from '../InterpreterValue'
import {sampleAwareUnaryPointwise} from '../UncertaintyValue'
import {FunctionArgumentType, FunctionPlugin, FunctionPluginTypecheck, ImplementedFunctions} from './FunctionPlugin'

export class SqrtPlugin extends FunctionPlugin implements FunctionPluginTypecheck<SqrtPlugin> {
  public static implementedFunctions: ImplementedFunctions = {
    'SQRT': {
      method: 'sqrt',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true}
      ],
    },
  }

  public sqrt(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('SQRT'), (arg: ExtendedNumber) =>
      sampleAwareUnaryPointwise(arg, this.config, Math.sqrt) ?? Math.sqrt(getRawValue(arg))
    )
  }
}
