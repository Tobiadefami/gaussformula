/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {ProcedureAst} from '../../parser/Ast'
import {InterpreterState} from '../InterpreterState'
import {DistributionNumber, ExtendedNumber, getRawValue, InterpreterValue} from '../InterpreterValue'
import {sampleAwareBinaryPointwise, sampleAwareUnaryPointwise} from '../UncertaintyValue'
import {FunctionArgumentType, FunctionPlugin, FunctionPluginTypecheck, ImplementedFunctions} from './FunctionPlugin'

export class LogarithmPlugin extends FunctionPlugin implements FunctionPluginTypecheck<LogarithmPlugin> {

  public static implementedFunctions: ImplementedFunctions = {
    'LOG10': {
      method: 'log10',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true}
      ]
    },
    'LOG': {
      method: 'log',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, greaterThan: 0, passSubtype: true},
        {argumentType: FunctionArgumentType.NUMBER, defaultValue: 10, greaterThan: 0, passSubtype: true},
      ]
    },
    'LN': {
      method: 'ln',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true},
        {argumentType: FunctionArgumentType.NUMBER, optionalArg: true, minValue: 0, passSubtype: true},
      ]
    },
  }

  public log10(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('LOG10'), (arg: ExtendedNumber) =>
      sampleAwareUnaryPointwise(arg, this.config, Math.log10) ?? Math.log10(getRawValue(arg))
    )
  }

  public log(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('LOG'),
      (arg: ExtendedNumber, base: ExtendedNumber) =>
        sampleAwareBinaryPointwise(arg, base, this.config, (value, baseValue) => Math.log(value) / Math.log(baseValue))
        ?? Math.log(getRawValue(arg)) / Math.log(getRawValue(base))
    )
  }

  public ln(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('LN'),
      (arg: ExtendedNumber, sigma?: ExtendedNumber) => {
        if (sigma === undefined) {
          return sampleAwareUnaryPointwise(arg, this.config, Math.log) ?? Math.log(getRawValue(arg))
        }
        return DistributionNumber.lognormal(getRawValue(arg), getRawValue(sigma))
      }
    )
  }
}
