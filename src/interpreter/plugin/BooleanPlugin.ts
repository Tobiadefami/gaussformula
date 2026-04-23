/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {CellError, ErrorType} from '../../Cell'
import {ErrorMessage} from '../../error-message'
import {SimpleRangeValue} from '../../SimpleRangeValue'
import {ProcedureAst} from '../../parser/Ast'
import {InterpreterState} from '../InterpreterState'
import {
  getRawValue,
  InternalNoErrorScalarValue,
  InternalScalarValue,
  InterpreterValue,
  isExtendedNumber,
  SampledDistribution,
} from '../InterpreterValue'
import {
  coerceScalarToBoolean,
} from '../ArithmeticHelper'
import {
  isUncertainValue,
  sampleAwareScalarBooleanResult,
  sampleAwareScalarNumericResult,
  samplesForValue,
} from '../UncertaintyValue'
import {FunctionArgumentType, FunctionPlugin, FunctionPluginTypecheck, ImplementedFunctions} from './FunctionPlugin'

/**
 * Interpreter plugin containing boolean functions
 */
export class BooleanPlugin extends FunctionPlugin implements FunctionPluginTypecheck<BooleanPlugin> {
  public static implementedFunctions: ImplementedFunctions = {
    'TRUE': {
      method: 'literalTrue',
      parameters: [],
    },
    'FALSE': {
      method: 'literalFalse',
      parameters: [],
    },
    'IF': {
      method: 'conditionalIf',
      parameters: [
        {argumentType: FunctionArgumentType.BOOLEAN},
        {argumentType: FunctionArgumentType.SCALAR, passSubtype: true},
        {argumentType: FunctionArgumentType.SCALAR, defaultValue: false, passSubtype: true},
      ],
    },
    'IFS': {
      method: 'ifs',
      parameters: [
        {argumentType: FunctionArgumentType.BOOLEAN},
        {argumentType: FunctionArgumentType.SCALAR, passSubtype: true},
      ],
      repeatLastArgs: 2,
    },
    'AND': {
      method: 'and',
      parameters: [
        {argumentType: FunctionArgumentType.BOOLEAN},
      ],
      repeatLastArgs: 1,
      expandRanges: true,
    },
    'OR': {
      method: 'or',
      parameters: [
        {argumentType: FunctionArgumentType.BOOLEAN},
      ],
      repeatLastArgs: 1,
      expandRanges: true,
    },
    'XOR': {
      method: 'xor',
      parameters: [
        {argumentType: FunctionArgumentType.BOOLEAN},
      ],
      repeatLastArgs: 1,
      expandRanges: true,
    },
    'NOT': {
      method: 'not',
      parameters: [
        {argumentType: FunctionArgumentType.BOOLEAN},
      ]
    },
    'SWITCH': {
      method: 'switch',
      parameters: [
        {argumentType: FunctionArgumentType.NOERROR},
        {argumentType: FunctionArgumentType.SCALAR, passSubtype: true},
        {argumentType: FunctionArgumentType.SCALAR, passSubtype: true},
      ],
      repeatLastArgs: 1,
    },
    'IFERROR': {
      method: 'iferror',
      parameters: [
        {argumentType: FunctionArgumentType.SCALAR, passSubtype: true},
        {argumentType: FunctionArgumentType.SCALAR, passSubtype: true},
      ]
    },
    'IFNA': {
      method: 'ifna',
      parameters: [
        {argumentType: FunctionArgumentType.SCALAR, passSubtype: true},
        {argumentType: FunctionArgumentType.SCALAR, passSubtype: true},
      ]
    },
    'CHOOSE': {
      method: 'choose',
      parameters: [
        {argumentType: FunctionArgumentType.INTEGER, minValue: 1},
        {argumentType: FunctionArgumentType.SCALAR, passSubtype: true},
      ],
      repeatLastArgs: 1,
    },
  }

  /**
   * Corresponds to TRUE()
   *
   * Returns the logical true
   * @param ast
   * @param state
   */
  public literalTrue(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('TRUE'), () => true)
  }

  /**
   * Corresponds to FALSE()
   *
   * Returns the logical false
   * @param ast
   * @param state
   */
  public literalFalse(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('FALSE'), () => false)
  }

  /**
   * Corresponds to IF(expression, value_if_true, value_if_false)
   *
   * Returns value specified as second argument if expression is true and third argument if expression is false
   * @param ast
   * @param state
   */
  public conditionalIf(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    const sampledResult = this.sampleAwareConditionalIf(ast, state)
    if (sampledResult !== undefined) {
      return sampledResult
    }

    return this.runFunction(ast.args, state, this.metadata('IF'), (condition, arg2, arg3) => {
      return condition ? arg2 : arg3
    })
  }

  /**
   * Implementation for the IFS function. Returns the value that corresponds to the first true condition.
   * @param ast
   * @param state
   */
  public ifs(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    const sampledResult = this.sampleAwareIfs(ast, state)
    if (sampledResult !== undefined) {
      return sampledResult
    }

    return this.runFunction(ast.args, state, this.metadata('IFS'), (...args) => {
      for (let idx = 0; idx < args.length; idx += 2) {
        if (args[idx]) {
          return args[idx+1]
        }
      }
      return new CellError(ErrorType.NA, ErrorMessage.NoConditionMet)
    })
  }

  /**
   * Corresponds to AND(expression1, [expression2, ...])
   *
   * Returns true if all of the provided arguments are logically true, and false if any of it is logically false
   * @param ast
   * @param state
   */
  public and(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    const sampledResult = this.sampleAwareLogicalOperation(ast, state, (values) => values.every((value) => value))
    if (sampledResult !== undefined) {
      return sampledResult
    }

    return this.runFunction(ast.args, state, this.metadata('AND'),
      (...args: (boolean | undefined)[]) => args.filter(arg => arg !== undefined).every(arg => !!arg)
    )
  }

  /**
   * Corresponds to OR(expression1, [expression2, ...])
   *
   * Returns true if any of the provided arguments are logically true, and false otherwise
   * @param ast
   * @param state
   */
  public or(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    const sampledResult = this.sampleAwareLogicalOperation(ast, state, (values) => values.some((value) => value))
    if (sampledResult !== undefined) {
      return sampledResult
    }

    return this.runFunction(ast.args, state, this.metadata('OR'),
      (...args: (boolean | undefined)[]) => args.filter(arg => arg !== undefined).some(arg => arg)
    )
  }

  public not(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    const sampledResult = this.sampleAwareNot(ast, state)
    if (sampledResult !== undefined) {
      return sampledResult
    }

    return this.runFunction(ast.args, state, this.metadata('NOT'), (arg) => !arg)
  }

  public xor(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    const sampledResult = this.sampleAwareLogicalOperation(ast, state, (values) =>
      values.filter((value) => value).length % 2 === 1
    )
    if (sampledResult !== undefined) {
      return sampledResult
    }

    return this.runFunction(ast.args, state, this.metadata('XOR'), (...args: (boolean | undefined)[]) => {
      let cnt = 0
      args.filter(arg => arg !== undefined).forEach(arg => {
        if (arg) {
          cnt++
        }
      })
      return (cnt % 2) === 1
    })
  }

  public switch(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    const sampledResult = this.sampleAwareSwitch(ast, state)
    if (sampledResult !== undefined) {
      return sampledResult
    }

    return this.runFunction(ast.args, state, this.metadata('SWITCH'), (selector, ...args) => {
      const n = args.length
      let i = 0
      for (; i + 1 < n; i += 2) {
        if (args[i] instanceof CellError) {
          continue
        }
        if (this.arithmeticHelper.eq(selector, args[i] as InternalNoErrorScalarValue)) {
          return args[i + 1]
        }
      }
      if (i < n) {
        return args[i]
      } else {
        return new CellError(ErrorType.NA, ErrorMessage.NoDefault)
      }
    })
  }

  public iferror(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('IFERROR'), (arg1: InternalScalarValue, arg2: InternalScalarValue) => {
      if (arg1 instanceof CellError) {
        return arg2
      } else {
        return arg1
      }
    })
  }

  public ifna(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('IFNA'), (arg1: InternalScalarValue, arg2: InternalScalarValue) => {
      if (arg1 instanceof CellError && arg1.type === ErrorType.NA) {
        return arg2
      } else {
        return arg1
      }
    })
  }

  public choose(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('CHOOSE'), (selector, ...args) => {
      if (selector > args.length) {
        return new CellError(ErrorType.NUM, ErrorMessage.Selector)
      }
      return args[selector - 1]
    })
  }

  private sampleAwareConditionalIf(ast: ProcedureAst, state: InterpreterState): InterpreterValue | undefined {
    if (ast.args.length < 2 || ast.args.length > 3) {
      return undefined
    }

    const condition = this.evaluateAst(ast.args[0], state)
    const whenTrue = this.evaluateAst(ast.args[1], state)
    const whenFalse = ast.args[2] !== undefined ? this.evaluateAst(ast.args[2], state) : false

    if (condition instanceof SimpleRangeValue || whenTrue instanceof SimpleRangeValue || whenFalse instanceof SimpleRangeValue) {
      return undefined
    }

    if (!this.containsUncertainValue(condition) && !this.containsUncertainValue(whenTrue) && !this.containsUncertainValue(whenFalse)) {
      return undefined
    }

    if (condition instanceof CellError) {
      return condition
    }

    const trueNumber = this.coerceScalarToNumberOrError(whenTrue)
    if (trueNumber instanceof CellError) {
      return trueNumber
    }

    const falseNumber = this.coerceScalarToNumberOrError(whenFalse)
    if (falseNumber instanceof CellError) {
      return falseNumber
    }

    return sampleAwareScalarNumericResult(
      [condition, trueNumber, falseNumber],
      this.config,
      ([sampledCondition, sampledTrue, sampledFalse]) => {
        const coercedCondition = this.coerceCondition(sampledCondition)
        if (coercedCondition instanceof CellError) {
          return coercedCondition
        }
        if (!isExtendedNumber(sampledTrue) || !isExtendedNumber(sampledFalse)) {
          return new CellError(ErrorType.VALUE, ErrorMessage.WrongType)
        }

        return coercedCondition ? getRawValue(sampledTrue) : getRawValue(sampledFalse)
      }
    )
  }

  private sampleAwareIfs(ast: ProcedureAst, state: InterpreterState): InterpreterValue | undefined {
    if (ast.args.length < 2 || ast.args.length % 2 !== 0) {
      return undefined
    }

    const evaluatedArgs = ast.args.map((arg) => this.evaluateAst(arg, state))
    if (evaluatedArgs.some((arg) => arg instanceof SimpleRangeValue)) {
      return undefined
    }

    if (!evaluatedArgs.some((arg) => this.containsUncertainValue(arg))) {
      return undefined
    }

    const sampledArgs: InternalNoErrorScalarValue[] = []
    for (let index = 0; index < evaluatedArgs.length; index += 2) {
      const condition = evaluatedArgs[index]
      const value = evaluatedArgs[index + 1]

      if (condition instanceof CellError) {
        return condition
      }
      if (condition instanceof SimpleRangeValue) {
        return undefined
      }
      if (value instanceof CellError) {
        return value
      }
      if (value instanceof SimpleRangeValue) {
        return undefined
      }

      const numericValue = this.coerceScalarToNumberOrError(value)
      if (numericValue instanceof CellError) {
        return numericValue
      }

      sampledArgs.push(condition, numericValue)
    }

    return sampleAwareScalarNumericResult(sampledArgs, this.config, (samples) => {
      for (let index = 0; index < samples.length; index += 2) {
        const coercedCondition = this.coerceCondition(samples[index])
        if (coercedCondition instanceof CellError) {
          return coercedCondition
        }
        if (coercedCondition) {
          const selectedValue = samples[index + 1]
          if (!isExtendedNumber(selectedValue)) {
            return new CellError(ErrorType.VALUE, ErrorMessage.WrongType)
          }

          return getRawValue(selectedValue)
        }
      }

      return new CellError(ErrorType.NA, ErrorMessage.NoConditionMet)
    })
  }

  private sampleAwareLogicalOperation(
    ast: ProcedureAst,
    state: InterpreterState,
    evaluate: (values: boolean[]) => boolean,
  ): InterpreterValue | undefined {
    const values = this.listOfScalarValues(ast.args, state)
    if (!values.some(([value]) => this.containsUncertainValue(value))) {
      return undefined
    }

    for (const [value] of values) {
      if (value instanceof CellError) {
        return value
      }
    }

    return sampleAwareScalarBooleanResult(
      values.map(([value]) => value as InternalNoErrorScalarValue),
      this.config,
      (samples) => {
        const coercedValues: boolean[] = []

        for (let index = 0; index < samples.length; index++) {
          const coercedValue = coerceScalarToBoolean(samples[index])
          if (coercedValue instanceof CellError) {
            return coercedValue
          }
          if (coercedValue === undefined) {
            if (values[index][1]) {
              continue
            }
            return new CellError(ErrorType.VALUE, ErrorMessage.WrongType)
          }

          coercedValues.push(coercedValue)
        }

        return evaluate(coercedValues)
      }
    )
  }

  private sampleAwareNot(ast: ProcedureAst, state: InterpreterState): InterpreterValue | undefined {
    if (ast.args.length !== 1) {
      return undefined
    }

    const value = this.evaluateAst(ast.args[0], state)
    if (value instanceof SimpleRangeValue || !this.containsUncertainValue(value)) {
      return undefined
    }
    if (value instanceof CellError) {
      return value
    }

    return sampleAwareScalarBooleanResult([value], this.config, ([sampledValue]) => {
      const coercedValue = this.coerceCondition(sampledValue)
      if (coercedValue instanceof CellError) {
        return coercedValue
      }
      return !coercedValue
    })
  }

  private sampleAwareSwitch(ast: ProcedureAst, state: InterpreterState): InterpreterValue | undefined {
    if (ast.args.length < 3) {
      return undefined
    }

    const selector = this.evaluateAst(ast.args[0], state)
    const args = ast.args.slice(1).map((arg) => this.evaluateAst(arg, state))

    if (selector instanceof SimpleRangeValue || args.some((arg) => arg instanceof SimpleRangeValue)) {
      return undefined
    }

    if (!this.containsUncertainValue(selector) && !args.some((arg) => this.containsUncertainValue(arg))) {
      return undefined
    }

    if (selector instanceof CellError) {
      return selector
    }

    const scalarSelector = selector
    const scalarArgs = args as InternalScalarValue[]
    const sampleCount = this.config.sampleSize
    const resultSamples: number[] = []

    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
      const sampledSelector = this.sampledSwitchValue(scalarSelector, sampleIndex) as InternalNoErrorScalarValue
      let selectedResult: InternalScalarValue | undefined
      let argIndex = 0

      for (; argIndex + 1 < scalarArgs.length; argIndex += 2) {
        const candidate = scalarArgs[argIndex]
        if (candidate instanceof CellError) {
          continue
        }

        const sampledCandidate = this.sampledSwitchValue(candidate, sampleIndex)
        if (this.arithmeticHelper.eq(sampledSelector, sampledCandidate as InternalNoErrorScalarValue)) {
          selectedResult = this.sampledSwitchValue(scalarArgs[argIndex + 1], sampleIndex)
          break
        }
      }

      if (selectedResult === undefined) {
        if (argIndex < scalarArgs.length) {
          selectedResult = this.sampledSwitchValue(scalarArgs[argIndex], sampleIndex)
        } else {
          return new CellError(ErrorType.NA, ErrorMessage.NoDefault)
        }
      }

      if (selectedResult instanceof CellError) {
        return selectedResult
      }

      const numericResult = this.coerceScalarToNumberOrError(selectedResult)
      if (numericResult instanceof CellError) {
        return numericResult
      }
      resultSamples.push(getRawValue(numericResult))
    }

    return new SampledDistribution(resultSamples, this.config)
  }

  private containsUncertainValue(value: InterpreterValue): boolean {
    if (value instanceof SimpleRangeValue) {
      return value.valuesFromTopLeftCorner().some((scalarValue) => isUncertainValue(scalarValue))
    }

    return isUncertainValue(value)
  }

  private coerceCondition(value: InternalScalarValue): boolean | CellError {
    const coercedValue = coerceScalarToBoolean(value)
    if (coercedValue instanceof CellError) {
      return coercedValue
    }
    if (coercedValue === undefined) {
      return new CellError(ErrorType.VALUE, ErrorMessage.WrongType)
    }

    return coercedValue
  }

  private sampledSwitchValue(value: InternalScalarValue, sampleIndex: number): InternalScalarValue {
    if (value instanceof CellError || !isUncertainValue(value)) {
      return value
    }

    const samples = samplesForValue(value, this.config)
    return samples[sampleIndex % samples.length]
  }
}
