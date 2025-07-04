/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {CellError, ErrorType, SimpleCellAddress} from '../../Cell'
import {ErrorMessage} from '../../error-message'
import {ProcedureAst} from '../../parser/Ast'
import {FunctionPlugin} from '../index'
import {InterpreterState} from '../InterpreterState'
import {InterpreterValue} from '../InterpreterValue'
import {FunctionArgumentType, FunctionPluginTypecheck, ImplementedFunctions} from './FunctionPlugin'

export class FormulaTextPlugin extends FunctionPlugin implements FunctionPluginTypecheck<FormulaTextPlugin> {
  public static implementedFunctions: ImplementedFunctions = {
    'FORMULATEXT': {
      method: 'formulatext',
      parameters: [
        {argumentType: FunctionArgumentType.NOERROR}
      ],
      doesNotNeedArgumentsToBeComputed: true,
      isDependentOnSheetStructureChange: true,
      vectorizationForbidden: true,
    },
  }

  /**
   * Corresponds to FORMULATEXT(value)
   *
   * Returns a formula in a given cell as a string.
   *
   * @param ast
   * @param state
   */
  public formulatext(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunctionWithReferenceArgument(ast.args, state, this.metadata('FORMULATEXT'),
      () => new CellError(ErrorType.NA, ErrorMessage.WrongArgNumber),
      (cellReference: SimpleCellAddress) => this.serialization.getCellFormula(cellReference) ?? new CellError(ErrorType.NA, ErrorMessage.Formula)
    )
  }
}
