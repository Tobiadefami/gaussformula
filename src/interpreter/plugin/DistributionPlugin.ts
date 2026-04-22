/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {CellError, ErrorType} from '../../Cell'
import {ErrorMessage} from '../../error-message'
import {ProcedureAst} from '../../parser/Ast'
import {InterpreterState} from '../InterpreterState'
import {DistributionNumber, InterpreterValue} from '../InterpreterValue'
import {FunctionArgumentType, FunctionPlugin, FunctionPluginTypecheck, ImplementedFunctions} from './FunctionPlugin'

export class DistributionPlugin extends FunctionPlugin implements FunctionPluginTypecheck<DistributionPlugin> {
  public static implementedFunctions: ImplementedFunctions = {
    'N': {
      method: 'normal',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER},
        {argumentType: FunctionArgumentType.NUMBER, minValue: 0},
      ],
    },
    'U': {
      method: 'uniform',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER},
        {argumentType: FunctionArgumentType.NUMBER},
      ],
    },
    'N.CI': {
      method: 'normalCi',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER},
        {argumentType: FunctionArgumentType.NUMBER},
        {argumentType: FunctionArgumentType.NUMBER, greaterThan: 0, lessThan: 100},
      ],
    },
    'LN.CI': {
      method: 'lognormalCi',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER},
        {argumentType: FunctionArgumentType.NUMBER},
        {argumentType: FunctionArgumentType.NUMBER, greaterThan: 0, lessThan: 100},
      ],
    },
  }

  public normal(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('N'),
      (mean: number, variance: number) => DistributionNumber.normal(mean, variance)
    )
  }

  public uniform(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('U'),
      (min: number, max: number) => {
        if (min >= max) {
          return new CellError(ErrorType.NUM, ErrorMessage.ValueLarge)
        }
        return DistributionNumber.uniform(min, max)
      }
    )
  }

  public normalCi(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('N.CI'),
      (lower: number, upper: number, confidence: number) => {
        if (lower >= upper) {
          return new CellError(ErrorType.NUM, ErrorMessage.ValueLarge)
        }
        return DistributionNumber.normalFromCI(lower, upper, confidence)
      }
    )
  }

  public lognormalCi(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('LN.CI'),
      (lower: number, upper: number, confidence: number) => {
        if (lower <= 0 || lower >= upper) {
          return new CellError(ErrorType.NUM, ErrorMessage.ValueSmall)
        }
        return DistributionNumber.lognormalFromCI(lower, upper, confidence)
      }
    )
  }
}
