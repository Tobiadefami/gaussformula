/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {CellError, ErrorType} from '../../Cell'
import {ErrorMessage} from '../../error-message'
import {ProcedureAst} from '../../parser/Ast'
import {InterpreterState} from '../InterpreterState'
import {ExtendedNumber, getRawValue, InterpreterValue} from '../InterpreterValue'
import {
  sampleAwareBinaryPointwise,
  sampleAwareTernaryPointwise,
  sampleAwareUnaryPointwise,
} from '../UncertaintyValue'
import {FunctionArgumentType, FunctionPlugin, FunctionPluginTypecheck, ImplementedFunctions} from './FunctionPlugin'

export function findNextOddNumber(arg: number): number {
  const ceiled = Math.ceil(arg)
  return (ceiled % 2 === 1) ? ceiled : ceiled + 1
}

export function findNextEvenNumber(arg: number): number {
  const ceiled = Math.ceil(arg)
  return (ceiled % 2 === 0) ? ceiled : ceiled + 1
}

export class RoundingPlugin extends FunctionPlugin implements FunctionPluginTypecheck<RoundingPlugin> {
  public static implementedFunctions: ImplementedFunctions = {
    'ROUNDUP': {
      method: 'roundup',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true},
        {argumentType: FunctionArgumentType.NUMBER, defaultValue: 0, passSubtype: true},
      ],
    },
    'ROUNDDOWN': {
      method: 'rounddown',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true},
        {argumentType: FunctionArgumentType.NUMBER, defaultValue: 0, passSubtype: true},
      ],
    },
    'ROUND': {
      method: 'round',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true},
        {argumentType: FunctionArgumentType.NUMBER, defaultValue: 0, passSubtype: true},
      ],
    },
    'INT': {
      method: 'intFunc',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true}
      ],
    },
    'EVEN': {
      method: 'even',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true}
      ],
    },
    'ODD': {
      method: 'odd',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true}
      ],
    },
    'CEILING.MATH': {
      method: 'ceilingmath',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true},
        {argumentType: FunctionArgumentType.NUMBER, defaultValue: 1, passSubtype: true},
        {argumentType: FunctionArgumentType.NUMBER, defaultValue: 0, passSubtype: true},
      ],
    },
    'CEILING': {
      method: 'ceiling',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true},
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true},
      ],
    },
    'CEILING.PRECISE': {
      method: 'ceilingprecise',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true},
        {argumentType: FunctionArgumentType.NUMBER, defaultValue: 1, passSubtype: true},
      ],
    },
    'FLOOR.MATH': {
      method: 'floormath',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true},
        {argumentType: FunctionArgumentType.NUMBER, defaultValue: 1, passSubtype: true},
        {argumentType: FunctionArgumentType.NUMBER, defaultValue: 0, passSubtype: true},
      ],
    },
    'FLOOR': {
      method: 'floor',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true},
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true},
      ],
    },
    'FLOOR.PRECISE': {
      method: 'floorprecise',
      parameters: [
        {argumentType: FunctionArgumentType.NUMBER, passSubtype: true},
        {argumentType: FunctionArgumentType.NUMBER, defaultValue: 1, passSubtype: true},
      ],
    },
  }

  public static aliases = {
    'ISO.CEILING': 'CEILING.PRECISE',
    'TRUNC': 'ROUNDDOWN',
  }

  public roundup(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runBinaryPointwise(ast, state, 'ROUNDDOWN', (numberToRound: number, places: number): number => {
      const placesMultiplier = Math.pow(10, places)
      if (numberToRound < 0) {
        return -Math.ceil(-numberToRound * placesMultiplier) / placesMultiplier
      } else {
        return Math.ceil(numberToRound * placesMultiplier) / placesMultiplier
      }
    })
  }

  public rounddown(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runBinaryPointwise(ast, state, 'ROUNDDOWN', (numberToRound: number, places: number): number => {
      const placesMultiplier = Math.pow(10, places)
      if (numberToRound < 0) {
        return -Math.floor(-numberToRound * placesMultiplier) / placesMultiplier
      } else {
        return Math.floor(numberToRound * placesMultiplier) / placesMultiplier
      }
    })
  }

  public round(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runBinaryPointwise(ast, state, 'ROUND', (numberToRound: number, places: number): number => {
      const placesMultiplier = Math.pow(10, places)
      if (numberToRound < 0) {
        return -Math.round(-numberToRound * placesMultiplier) / placesMultiplier
      } else {
        return Math.round(numberToRound * placesMultiplier) / placesMultiplier
      }
    })
  }

  public intFunc(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runUnaryPointwise(ast, state, 'INT', (coercedNumberToRound) => {
      if (coercedNumberToRound < 0) {
        return -Math.floor(-coercedNumberToRound)
      } else {
        return Math.floor(coercedNumberToRound)
      }
    })
  }

  public even(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runUnaryPointwise(ast, state, 'EVEN', (coercedNumberToRound) => {
      if (coercedNumberToRound < 0) {
        return -findNextEvenNumber(-coercedNumberToRound)
      } else {
        return findNextEvenNumber(coercedNumberToRound)
      }
    })
  }

  public odd(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runUnaryPointwise(ast, state, 'ODD', (coercedNumberToRound) => {
      if (coercedNumberToRound < 0) {
        return -findNextOddNumber(-coercedNumberToRound)
      } else {
        return findNextOddNumber(coercedNumberToRound)
      }
    })
  }

  public ceilingmath(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runTernaryPointwise(ast, state, 'CEILING.MATH',
      (value: number, significance: number, mode: number) => {
        if (significance === 0 || value === 0) {
          return 0
        }

        significance = Math.abs(significance)
        if (mode === 1 && value < 0) {
          significance = -significance
        }

        return Math.ceil(value / significance) * significance
      })
  }

  public ceiling(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runBinaryPointwise(ast, state, 'CEILING',
      (value: number, significance: number) => {
        if (value === 0) {
          return 0
        }
        if (significance === 0) {
          return new CellError(ErrorType.DIV_BY_ZERO)
        }

        if ((value > 0) && (significance < 0)) {
          return new CellError(ErrorType.NUM, ErrorMessage.DistinctSigns)
        }

        return Math.ceil(value / significance) * significance
      })
  }

  public ceilingprecise(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runBinaryPointwise(ast, state, 'CEILING.PRECISE',
      (value: number, significance: number) => {
        if (significance === 0 || value === 0) {
          return 0
        }
        significance = Math.abs(significance)
        return Math.ceil(value / significance) * significance
      })
  }

  public floormath(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runTernaryPointwise(ast, state, 'FLOOR.MATH',
      (value: number, significance: number, mode: number) => {
        if (significance === 0 || value === 0) {
          return 0
        }

        significance = Math.abs(significance)
        if (mode === 1 && value < 0) {
          significance *= -1
        }

        return Math.floor(value / significance) * significance
      })
  }

  public floor(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runBinaryPointwise(ast, state, 'FLOOR',
      (value: number, significance: number) => {
        if (value === 0) {
          return 0
        }
        if (significance === 0) {
          return new CellError(ErrorType.DIV_BY_ZERO)
        }

        if ((value > 0) && (significance < 0)) {
          return new CellError(ErrorType.NUM, ErrorMessage.DistinctSigns)
        }

        return Math.floor(value / significance) * significance
      })
  }

  public floorprecise(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    return this.runBinaryPointwise(ast, state, 'FLOOR.PRECISE',
      (value: number, significance: number) => {
        if (significance === 0 || value === 0) {
          return 0
        }

        significance = Math.abs(significance)
        return Math.floor(value / significance) * significance
      })
  }

  private runUnaryPointwise(
    ast: ProcedureAst,
    state: InterpreterState,
    metadataName: string,
    transform: (value: number) => number | CellError,
  ): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata(metadataName), (value: ExtendedNumber) =>
      sampleAwareUnaryPointwise(value, this.config, transform) ?? transform(getRawValue(value))
    )
  }

  private runBinaryPointwise(
    ast: ProcedureAst,
    state: InterpreterState,
    metadataName: string,
    transform: (left: number, right: number) => number | CellError,
  ): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata(metadataName), (left: ExtendedNumber, right: ExtendedNumber) =>
      sampleAwareBinaryPointwise(left, right, this.config, transform) ?? transform(getRawValue(left), getRawValue(right))
    )
  }

  private runTernaryPointwise(
    ast: ProcedureAst,
    state: InterpreterState,
    metadataName: string,
    transform: (first: number, second: number, third: number) => number | CellError,
  ): InterpreterValue {
    return this.runFunction(ast.args, state, this.metadata(metadataName), (first: ExtendedNumber, second: ExtendedNumber, third: ExtendedNumber) =>
      sampleAwareTernaryPointwise(first, second, third, this.config, transform)
      ?? transform(getRawValue(first), getRawValue(second), getRawValue(third))
    )
  }
}
