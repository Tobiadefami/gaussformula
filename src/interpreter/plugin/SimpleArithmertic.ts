/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {ProcedureAst} from '../../parser/Ast'
import {InterpreterState} from '../InterpreterState'
import {InterpreterValue} from '../InterpreterValue'
import {sampleAwareScalarBooleanResult} from '../UncertaintyValue'
import {FunctionArgumentType, FunctionPlugin, FunctionPluginTypecheck, ImplementedFunctions} from './FunctionPlugin'

export class SimpleArithmerticPlugin extends FunctionPlugin implements FunctionPluginTypecheck<SimpleArithmerticPlugin> {
  public static implementedFunctions: ImplementedFunctions = {
    'HF.ADD': {
      method: 'add',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true},
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true},
      ],
    },
    'HF.CONCAT': {
      method: 'concat',
      parameters: [
        {argumentType: FunctionArgumentType.STRING, passSubtype: true},
        {argumentType: FunctionArgumentType.STRING, passSubtype: true},
      ],
    },
    'HF.DIVIDE': {
      method: 'divide',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true},
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true},
      ],
    },
    'HF.EQ': {
      method: 'eq',
      parameters: [
        {argumentType: FunctionArgumentType.NOERROR, passSubtype: true},
        {argumentType: FunctionArgumentType.NOERROR, passSubtype: true},
      ]
    },
    'HF.GT': {
      method: 'gt',
      parameters: [
        {argumentType: FunctionArgumentType.NOERROR, passSubtype: true},
        {argumentType: FunctionArgumentType.NOERROR, passSubtype: true},
      ]
    },
    'HF.GTE': {
      method: 'gte',
      parameters: [
        {argumentType: FunctionArgumentType.NOERROR, passSubtype: true},
        {argumentType: FunctionArgumentType.NOERROR, passSubtype: true},
      ]
    },
    'HF.LT': {
      method: 'lt',
      parameters: [
        {argumentType: FunctionArgumentType.NOERROR, passSubtype: true},
        {argumentType: FunctionArgumentType.NOERROR, passSubtype: true},
      ]
    },
    'HF.LTE': {
      method: 'lte',
      parameters: [
        {argumentType: FunctionArgumentType.NOERROR, passSubtype: true},
        {argumentType: FunctionArgumentType.NOERROR, passSubtype: true},
      ]
    },
    'HF.MINUS': {
      method: 'minus',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true},
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true},
      ],
    },
    'HF.MULTIPLY': {
      method: 'multiply',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true},
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true},
      ],
    },
    'HF.NE': {
      method: 'ne',
      parameters: [
        {argumentType: FunctionArgumentType.NOERROR, passSubtype: true},
        {argumentType: FunctionArgumentType.NOERROR, passSubtype: true},
      ]
    },
    'HF.POW': {
      method: 'pow',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true},
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true},
      ],
    },
    'HF.UMINUS': {
      method: 'uminus',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true},
      ],
    },
    'HF.UNARY_PERCENT': {
      method: 'upercent',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true},
      ],
    },
    'HF.UPLUS': {
      method: 'uplus',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true},
      ],
    },
  }

  public add(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('HF.ADD'),
      this.arithmeticHelper.addWithEpsilon
    )
  }

  public concat(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('HF.CONCAT'),
      this.arithmeticHelper.concat
    )
  }

  public divide(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('HF.DIVIDE'),
      this.arithmeticHelper.divide
    )
  }

  public eq(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('HF.EQ'),
      (left, right) =>
        sampleAwareScalarBooleanResult([left, right], this.config, ([sampledLeft, sampledRight]) =>
          this.arithmeticHelper.eq(sampledLeft, sampledRight)
        ) ?? this.arithmeticHelper.eq(left, right)
    )
  }

  public gt(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('HF.GT'),
      (left, right) =>
        sampleAwareScalarBooleanResult([left, right], this.config, ([sampledLeft, sampledRight]) =>
          this.arithmeticHelper.gt(sampledLeft, sampledRight)
        ) ?? this.arithmeticHelper.gt(left, right)
    )
  }

  public gte(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('HF.GTE'),
      (left, right) =>
        sampleAwareScalarBooleanResult([left, right], this.config, ([sampledLeft, sampledRight]) =>
          this.arithmeticHelper.geq(sampledLeft, sampledRight)
        ) ?? this.arithmeticHelper.geq(left, right)
    )
  }

  public lt(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('HF.LT'),
      (left, right) =>
        sampleAwareScalarBooleanResult([left, right], this.config, ([sampledLeft, sampledRight]) =>
          this.arithmeticHelper.lt(sampledLeft, sampledRight)
        ) ?? this.arithmeticHelper.lt(left, right)
    )
  }

  public lte(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('HF.LTE'),
      (left, right) =>
        sampleAwareScalarBooleanResult([left, right], this.config, ([sampledLeft, sampledRight]) =>
          this.arithmeticHelper.leq(sampledLeft, sampledRight)
        ) ?? this.arithmeticHelper.leq(left, right)
    )
  }

  public minus(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('HF.MINUS'),
      this.arithmeticHelper.subtract
    )
  }

  public multiply(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('HF.MULTIPLY'),
      this.arithmeticHelper.multiply
    )
  }

  public ne(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('HF.NE'),
      (left, right) =>
        sampleAwareScalarBooleanResult([left, right], this.config, ([sampledLeft, sampledRight]) =>
          this.arithmeticHelper.neq(sampledLeft, sampledRight)
        ) ?? this.arithmeticHelper.neq(left, right)
    )
  }

  public pow(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('HF.POW'),
      this.arithmeticHelper.pow
    )
  }

  public uminus(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('HF.UMINUS'),
      this.arithmeticHelper.unaryMinus
    )
  }

  public upercent(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('HF.UNARY_PERCENT'),
      this.arithmeticHelper.unaryPercent
    )
  }

  public uplus(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('HF.UPLUS'),
      this.arithmeticHelper.unaryPlus
    )
  }
}
