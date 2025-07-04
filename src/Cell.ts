/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {ArrayVertex, CellVertex, FormulaCellVertex, ParsingErrorVertex, ValueCellVertex} from './DependencyGraph'
import {
  EmptyValue,
  InterpreterValue,
  NumberType,
  getFormatOfExtendedNumber,
  getTypeOfExtendedNumber,
  isExtendedNumber,
} from './interpreter/InterpreterValue'

import {AddressWithSheet} from './parser/Address'
import {CellAddress} from './parser'
import {ErrorMessage} from './error-message'
import {FormulaVertex} from './DependencyGraph/FormulaCellVertex'
import {Maybe} from './Maybe'
import {SimpleRangeValue} from './SimpleRangeValue'

/**
 * Possible errors returned by our interpreter.
 */
export enum ErrorType {
  /** Division by zero. */
  DIV_BY_ZERO = 'DIV_BY_ZERO',

  /** Unknown function name. */
  NAME = 'NAME',
  VALUE = 'VALUE',
  NUM = 'NUM',
  NA = 'NA',

  /** Cyclic dependency. */
  CYCLE = 'CYCLE',

  /** Wrong address reference. */
  REF = 'REF',

  /** Array spill error. */
  SPILL = 'SPILL',

  /** Invalid/missing licence error. */
  LIC = 'LIC',

  /** Generic error */
  ERROR = 'ERROR'
}

export type TranslatableErrorType = Exclude<ErrorType, ErrorType.LIC>

export enum CellType {
  FORMULA = 'FORMULA',
  VALUE = 'VALUE',
  ARRAY = 'ARRAY',
  EMPTY = 'EMPTY',
  ARRAYFORMULA = 'ARRAYFORMULA',
}

export const getCellType = (vertex: Maybe<CellVertex>, address: SimpleCellAddress): CellType => {
  if (vertex instanceof ArrayVertex) {
    if (vertex.isLeftCorner(address)) {
      return CellType.ARRAYFORMULA
    } else {
      return CellType.ARRAY
    }
  }
  if (vertex instanceof FormulaCellVertex || vertex instanceof ParsingErrorVertex) {
    return CellType.FORMULA
  }
  if (vertex instanceof ValueCellVertex) {
    return CellType.VALUE
  }

  return CellType.EMPTY
}

export enum CellValueNoNumber {
  EMPTY = 'EMPTY',
  NUMBER = 'NUMBER',
  STRING = 'STRING',
  BOOLEAN = 'BOOLEAN',
  ERROR = 'ERROR',
}

export enum CellValueJustNumber {
  NUMBER = 'NUMBER'
}

export type CellValueType = CellValueNoNumber | CellValueJustNumber
export const CellValueType = {...CellValueNoNumber, ...CellValueJustNumber}

export type CellValueDetailedType = CellValueNoNumber | NumberType
export const CellValueDetailedType = {...CellValueNoNumber, ...NumberType}

export const CellValueTypeOrd = (arg: CellValueType): number => {
  switch (arg) {
    case CellValueType.EMPTY:
      return 0
    case CellValueType.NUMBER:
      return 1
    case CellValueType.STRING:
      return 2
    case CellValueType.BOOLEAN:
      return 3
    case CellValueType.ERROR:
      return 4
  }
  throw new Error('Cell value not computed')
}

export const getCellValueType = (cellValue: InterpreterValue): CellValueType => {
  if (cellValue === EmptyValue) {
    return CellValueType.EMPTY
  }

  if (cellValue instanceof CellError || cellValue instanceof SimpleRangeValue) {
    return CellValueType.ERROR
  }

  if (typeof cellValue === 'string') {
    return CellValueType.STRING
  } else if (isExtendedNumber(cellValue)) {
    return CellValueType.NUMBER
  } else if (typeof cellValue === 'boolean') {
    return CellValueType.BOOLEAN
  }

  throw new Error('Cell value not computed')
}

export const getCellValueDetailedType = (cellValue: InterpreterValue): CellValueDetailedType => {
  if (isExtendedNumber(cellValue)) {
    return getTypeOfExtendedNumber(cellValue)
  } else {
    return getCellValueType(cellValue) as CellValueDetailedType
  }
}

export const getCellValueFormat = (cellValue: InterpreterValue): string | undefined => {
  if (isExtendedNumber(cellValue)) {
    return getFormatOfExtendedNumber(cellValue)
  } else {
    return undefined
  }
}

export class CellError {
  constructor(
    public readonly type: ErrorType,
    public readonly message?: string,
    public readonly root?: FormulaVertex
  ) {
  }

  /**
   * Returns a CellError with a given message.
   * @param {string} detailedMessage - message to be displayed
   */
  public static parsingError(detailedMessage?: string): CellError {
    return new CellError(ErrorType.ERROR, `${ErrorMessage.ParseError}${detailedMessage ? ' ' + detailedMessage : ''}`)
  }

  public attachRootVertex(vertex: FormulaVertex): CellError {
    if (this.root === undefined) {
      return new CellError(this.type, this.message, vertex)
    } else {
      return this
    }
  }
}

export interface SimpleRowAddress {
  row: number,
  sheet: number,
}

export const simpleRowAddress = (sheet: number, row: number): SimpleRowAddress => ({sheet, row})

export const invalidSimpleRowAddress = (address: SimpleRowAddress): boolean => (address.row < 0)

export interface SimpleColumnAddress {
  col: number,
  sheet: number,
}

export const simpleColumnAddress = (sheet: number, col: number): SimpleColumnAddress => ({sheet, col})

export const invalidSimpleColumnAddress = (address: SimpleColumnAddress): boolean => (address.col < 0)

export interface SimpleCellAddress {
  col: number,
  row: number,
  sheet: number,
}

export const simpleCellAddress = (sheet: number, col: number, row: number): SimpleCellAddress => ({sheet, col, row})
export const invalidSimpleCellAddress = (address: SimpleCellAddress): boolean => (address.col < 0 || address.row < 0)
export const movedSimpleCellAddress = (address: SimpleCellAddress, toSheet: number, toRight: number, toBottom: number): SimpleCellAddress => {
  return simpleCellAddress(toSheet, address.col + toRight, address.row + toBottom)
}

export const addressKey = (address: SimpleCellAddress) => `${address.sheet},${address.row},${address.col}`

/**
 * Checks if the object is a simple cell address.
 */
export function isSimpleCellAddress(obj: unknown): obj is SimpleCellAddress {
  return obj !== null
    && (typeof obj === 'object' || typeof obj === 'function')
    && typeof (obj as SimpleCellAddress)?.sheet === 'number'
    && typeof (obj as SimpleCellAddress)?.col === 'number'
    && typeof (obj as SimpleCellAddress)?.row === 'number'
}

export const absoluteSheetReference = (address: AddressWithSheet, baseAddress: SimpleCellAddress): number => {
  return address.sheet ?? baseAddress.sheet
}

export const equalSimpleCellAddress = (left: SimpleCellAddress, right: SimpleCellAddress) => {
  return left.sheet === right.sheet && left.col === right.col && left.row === right.row
}

export interface SheetCellAddress {
  col: number,
  row: number,
}

export interface CellRange {
  start: CellAddress,
  end: CellAddress,
}
