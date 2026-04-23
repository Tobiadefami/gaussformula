/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {CellError, ErrorType} from '../../Cell'
import {ErrorMessage} from '../../error-message'
import {ProcedureAst} from '../../parser/Ast'
import {InterpreterState} from '../InterpreterState'
import {InterpreterValue, SampledDistribution} from '../InterpreterValue'
import {sampleAwareExactAggregate} from '../UncertaintyValue'
import {SimpleRangeValue} from '../../SimpleRangeValue'
import {FunctionArgumentType, FunctionPlugin, FunctionPluginTypecheck, ImplementedFunctions} from './FunctionPlugin'

/**
 * Interpreter plugin containing MEDIAN function
 */
export class MedianPlugin extends FunctionPlugin implements FunctionPluginTypecheck<MedianPlugin> {

  public static implementedFunctions: ImplementedFunctions = {
    'MEDIAN': {
      method: 'median',
      parameters: [
        {argumentType: FunctionArgumentType.ANY},
      ],
      repeatLastArgs: 1,
    },
    'LARGE': {
      method: 'large',
      parameters: [
        {argumentType: FunctionArgumentType.RANGE},
        {argumentType: FunctionArgumentType.NUMBER, minValue: 1},
      ],
    },
    'SMALL': {
      method: 'small',
      parameters: [
        {argumentType: FunctionArgumentType.RANGE},
        {argumentType: FunctionArgumentType.NUMBER, minValue: 1},
      ],
    },
  }

  /**
   * Corresponds to MEDIAN(Number1, Number2, ...).
   *
   * Returns a median of given numbers.
   * @param ast
   * @param state
   */
  public median(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('MEDIAN'),
      (...args: InterpreterValue[]) => {
        const sampled = this.sampleAwareRankAggregate(args, (values) => this.medianValue(values))
        if (sampled !== undefined) {
          return sampled
        }

        const values = this.arithmeticHelper.coerceNumbersExactRanges(args)
        if (values instanceof CellError) {
          return values
        }
        if (values.length === 0) {
          return new CellError(ErrorType.NUM, ErrorMessage.OneValue)
        }
        values.sort((a, b) => (a - b))
        if (values.length % 2 === 0) {
          return (values[(values.length / 2) - 1] + values[values.length / 2]) / 2
        } else {
          return values[Math.floor(values.length / 2)]
        }
      })
  }

  public large(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('LARGE'),
      (range: SimpleRangeValue, n: number) => {
        const sampled = this.sampleAwareRankAggregate([range], (values) => {
          const truncatedN = Math.trunc(n)
          if (truncatedN > values.length) {
            return new CellError(ErrorType.NUM, ErrorMessage.ValueLarge)
          }
          return values.sort((a, b) => a - b)[values.length - truncatedN]
        })
        if (sampled !== undefined) {
          return sampled
        }

        const vals = this.arithmeticHelper.manyToExactNumbers(range.valuesFromTopLeftCorner())
        if (vals instanceof CellError) {
          return vals
        }
        vals.sort((a, b) => a - b)
        n = Math.trunc(n)
        if (n > vals.length) {
          return new CellError(ErrorType.NUM, ErrorMessage.ValueLarge)
        }
        return vals[vals.length - n]
      }
    )
  }

  public small(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('SMALL'),
      (range: SimpleRangeValue, n: number) => {
        const sampled = this.sampleAwareRankAggregate([range], (values) => {
          const truncatedN = Math.trunc(n)
          if (truncatedN > values.length) {
            return new CellError(ErrorType.NUM, ErrorMessage.ValueLarge)
          }
          return values.sort((a, b) => a - b)[truncatedN - 1]
        })
        if (sampled !== undefined) {
          return sampled
        }

        const vals = this.arithmeticHelper.manyToExactNumbers(range.valuesFromTopLeftCorner())
        if (vals instanceof CellError) {
          return vals
        }
        vals.sort((a, b) => a - b)
        n = Math.trunc(n)
        if (n > vals.length) {
          return new CellError(ErrorType.NUM, ErrorMessage.ValueLarge)
        }
        return vals[n - 1]
      }
    )
  }

  private sampleAwareRankAggregate(
    args: InterpreterValue[],
    aggregateSamples: (values: number[]) => number | CellError,
  ): SampledDistribution | CellError | undefined {
    return sampleAwareExactAggregate(
      args,
      this.config,
      (arg) => this.arithmeticHelper.coerceScalarToNumberOrError(arg),
      aggregateSamples,
    )
  }

  private medianValue(values: number[]): number {
    values.sort((a, b) => a - b)
    if (values.length % 2 === 0) {
      return (values[(values.length / 2) - 1] + values[values.length / 2]) / 2
    }

    return values[Math.floor(values.length / 2)]
  }
}
