/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {CellError, ErrorType} from '../../Cell'
import {ErrorMessage} from '../../error-message'
import {ProcedureAst} from '../../parser/Ast'
import {InterpreterState} from '../InterpreterState'
import {ExtendedNumber, getRawValue, InterpreterValue, isExtendedNumber, SampledDistribution} from '../InterpreterValue'
import {isUncertainValue, samplesForValue} from '../UncertaintyValue'
import {SimpleRangeValue} from '../../SimpleRangeValue'
import {FunctionArgumentType, FunctionPlugin, FunctionPluginTypecheck, ImplementedFunctions} from './FunctionPlugin'

export class SumprodPlugin extends FunctionPlugin implements FunctionPluginTypecheck<SumprodPlugin> {
  public static implementedFunctions: ImplementedFunctions = {
    'SUMPRODUCT': {
      method: 'sumproduct',
      parameters: [
        {argumentType: FunctionArgumentType.RANGE},
      ],
      repeatLastArgs: 1,
    },
  }

  public sumproduct(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata('SUMPRODUCT'), (...args: SimpleRangeValue[]) => {
      const width = args[0].width()
      const height = args[0].height()
      for (const arg of args) {
        if (arg.width() !== width || arg.height() !== height) {
          return new CellError(ErrorType.VALUE, ErrorMessage.EqualLength)
        }
      }

      let ret = 0
      let hasUncertainty = false
      const terms: (ExtendedNumber | undefined)[][] = []
      const iterators = args.map(arg => arg.iterateValuesFromTopLeftCorner())
      for (let i = 0; i < width * height; i++) {
        let acc = 1
        const term: (ExtendedNumber | undefined)[] = []
        for (const it of iterators) {
          const val = it.next().value
          if (val instanceof CellError) {
            return val
          }
          const coercedVal = this.coerceScalarToNumberOrError(val)
          if (isExtendedNumber(coercedVal)) {
            acc *= getRawValue(coercedVal)
            term.push(coercedVal)
            hasUncertainty = hasUncertainty || isUncertainValue(coercedVal)
          } else {
            acc = 0
            term.push(undefined)
          }
        }
        ret += acc
        terms.push(term)
      }

      if (hasUncertainty) {
        const resultSamples = Array.from({length: this.config.sampleSize}, (_, sampleIndex) => {
          return terms.reduce((total, term) => {
            const product = term.reduce<number>((acc, value) => {
              if (value === undefined) {
                return 0
              }
              const samples = samplesForValue(value, this.config)
              const sample = samples[sampleIndex % samples.length] ?? 0
              return acc * sample
            }, 1)
            return total + product
          }, 0)
        })

        return new SampledDistribution(resultSamples, this.config)
      }

      return ret
    })
  }
}
