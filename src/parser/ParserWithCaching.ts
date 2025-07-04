/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {Ast, ParsingError, ParsingErrorType, RangeSheetReferenceType, imageWithWhitespace} from './Ast'
import {AstNodeType, CellAddress, RelativeDependency, buildParsingErrorAst, collectDependencies} from './'
import {
  CellReference,
  ColumnRange,
  LexerConfig,
  ProcedureName,
  RowRange,
  buildLexerConfig,
} from './LexerConfig'
import {ErrorType, SimpleCellAddress} from '../Cell'
import {ExtendedToken, FormulaLexer, FormulaParser} from './FormulaParser'
import {ILexingResult, IToken, tokenMatcher} from 'chevrotain'
import {
  SheetMappingFn,
  cellAddressFromString,
  columnAddressFromString,
  rowAddressFromString,
} from './addressRepresentationConverters'

import {Cache} from './Cache'
import {ColumnAddress} from './ColumnAddress'
import {FunctionRegistry} from '../interpreter/FunctionRegistry'
import {ParserConfig} from './ParserConfig'
import {RowAddress} from './RowAddress'
import {binaryOpTokenMap} from './binaryOpTokenMap'
import {formatNumber} from './Unparser'

export interface ParsingResult {
  ast: Ast,
  errors: ParsingError[],
  dependencies: RelativeDependency[],
  hasVolatileFunction: boolean,
  hasStructuralChangeFunction: boolean,
}

/**
 * Parses formula using caching if feasible.
 */
export class ParserWithCaching {
  public statsCacheUsed: number = 0
  private cache: Cache
  private lexer: FormulaLexer
  private readonly lexerConfig: LexerConfig
  private formulaParser: FormulaParser
  private formulaAddress?: SimpleCellAddress

  constructor(
    private readonly config: ParserConfig,
    private readonly functionRegistry: FunctionRegistry,
    private readonly sheetMapping: SheetMappingFn,
  ) {
    this.lexerConfig = buildLexerConfig(config)
    this.lexer = new FormulaLexer(this.lexerConfig)
    this.formulaParser = new FormulaParser(this.lexerConfig, this.sheetMapping)
    this.cache = new Cache(this.functionRegistry)
  }

  /**
   * Parses a formula.
   *
   * @param text - formula to parse
   * @param formulaAddress - address with regard to which formula should be parsed. Impacts computed addresses in R0C0 format.
   */
  public parse(text: string, formulaAddress: SimpleCellAddress): ParsingResult {
    this.formulaAddress = formulaAddress
    const lexerResult = this.tokenizeFormula(text)

    if (lexerResult.errors.length > 0) {
      const errors = lexerResult.errors.map((e) =>
        ({
          type: ParsingErrorType.LexingError,
          message: e.message,
        }),
      )
      return {
        ast: buildParsingErrorAst(),
        errors,
        hasVolatileFunction: false,
        hasStructuralChangeFunction: false,
        dependencies: []
      }
    }

    const hash = this.computeHashFromTokens(lexerResult.tokens, formulaAddress)

    let cacheResult = this.cache.get(hash)
    if (cacheResult !== undefined) {
      ++this.statsCacheUsed
    } else {
      const processedTokens = this.bindWhitespacesToTokens(lexerResult.tokens)
      const parsingResult = this.formulaParser.parseFromTokens(processedTokens, formulaAddress)

      if (parsingResult.errors.length > 0) {
        return {...parsingResult, hasVolatileFunction: false, hasStructuralChangeFunction: false, dependencies: []}
      } else {
        cacheResult = this.cache.set(hash, parsingResult.ast)
      }
    }

    const {ast, hasVolatileFunction, hasStructuralChangeFunction } = cacheResult
    const astWithNoReversedRanges = this.convertReversedRangesToRegularRanges(ast)
    const dependencies = collectDependencies(astWithNoReversedRanges, this.functionRegistry)

    return {ast: astWithNoReversedRanges, errors: [], hasVolatileFunction, hasStructuralChangeFunction, dependencies }
  }

  private convertReversedRangesToRegularRanges(ast: Ast): Ast {
    switch (ast.type) {
      case AstNodeType.EMPTY:
      case AstNodeType.NUMBER:
      case AstNodeType.STRING:
      case AstNodeType.ERROR:
      case AstNodeType.ERROR_WITH_RAW_INPUT:
      case AstNodeType.CELL_REFERENCE:
      case AstNodeType.NAMED_EXPRESSION:
      case AstNodeType.GAUSSIAN_NUMBER:
        return ast
      case AstNodeType.CELL_RANGE: {
        const { start, end } = ast
        const orderedEnds = this.orderCellRangeEnds(start, end)
        return { ...ast, start: orderedEnds.start, end: orderedEnds.end }
      }
      case AstNodeType.COLUMN_RANGE: {
        const { start, end } = ast
        const orderedEnds = this.orderColumnRangeEnds(start, end)
        return { ...ast, start: orderedEnds.start, end: orderedEnds.end }
      }
      case AstNodeType.ROW_RANGE: {
        const { start, end } = ast
        const orderedEnds = this.orderRowRangeEnds(start, end)
        return { ...ast, start: orderedEnds.start, end: orderedEnds.end }
      }
      case AstNodeType.PERCENT_OP:
      case AstNodeType.PLUS_UNARY_OP:
      case AstNodeType.MINUS_UNARY_OP: {
        const valueFixed = this.convertReversedRangesToRegularRanges(ast.value)
        return { ...ast, value: valueFixed }
      }
      case AstNodeType.CONCATENATE_OP:
      case AstNodeType.EQUALS_OP:
      case AstNodeType.NOT_EQUAL_OP:
      case AstNodeType.LESS_THAN_OP:
      case AstNodeType.GREATER_THAN_OP:
      case AstNodeType.LESS_THAN_OR_EQUAL_OP:
      case AstNodeType.GREATER_THAN_OR_EQUAL_OP:
      case AstNodeType.MINUS_OP:
      case AstNodeType.PLUS_OP:
      case AstNodeType.TIMES_OP:
      case AstNodeType.DIV_OP:
      case AstNodeType.POWER_OP: {
        const leftFixed = this.convertReversedRangesToRegularRanges(ast.left)
        const rightFixed = this.convertReversedRangesToRegularRanges(ast.right)
        return { ...ast, left: leftFixed, right: rightFixed }
      }
      case AstNodeType.PARENTHESIS: {
        const exprFixed = this.convertReversedRangesToRegularRanges(ast.expression)
        return { ...ast, expression: exprFixed }
      }
      case AstNodeType.FUNCTION_CALL: {
        const argsFixed = ast.args.map(arg => this.convertReversedRangesToRegularRanges(arg))
        return { ...ast, args: argsFixed }
      }
      case AstNodeType.ARRAY: {
        const argsFixed = ast.args.map(argsRow => argsRow.map(arg => this.convertReversedRangesToRegularRanges(arg)))
        return { ...ast, args: argsFixed }
      }
      default:
        return ast;
    }
  }

  private orderCellRangeEnds(endA: CellAddress, endB: CellAddress): { start: CellAddress, end: CellAddress } {
    const ends = [ endA, endB ]
    const [ startCol, endCol ] = ends.map(e => e.toColumnAddress()).sort(ColumnAddress.compareByAbsoluteAddress(this.formulaAddress!))
    const [ startRow, endRow ] = ends.map(e => e.toRowAddress()).sort(RowAddress.compareByAbsoluteAddress(this.formulaAddress!))
    const [ startSheet, endSheet ] = ends.map(e => e.sheet).sort(ParserWithCaching.compareSheetIds.bind(this))

    return {
      start: CellAddress.fromColAndRow(startCol, startRow, startSheet),
      end: CellAddress.fromColAndRow(endCol, endRow, endSheet),
    }
  }

  private orderColumnRangeEnds(endA: ColumnAddress, endB: ColumnAddress): { start: ColumnAddress, end: ColumnAddress } {
    const ends = [ endA, endB ]
    const [ startCol, endCol ] = ends.sort(ColumnAddress.compareByAbsoluteAddress(this.formulaAddress!))
    const [ startSheet, endSheet ] = ends.map(e => e.sheet).sort(ParserWithCaching.compareSheetIds.bind(this))

    return {
      start: new ColumnAddress(startCol.type, startCol.col, startSheet),
      end: new ColumnAddress(endCol.type, endCol.col, endSheet),
    }
  }

  private orderRowRangeEnds(endA: RowAddress, endB: RowAddress): { start: RowAddress, end: RowAddress } {
    const ends = [ endA, endB ]
    const [ startRow, endRow ] = ends.sort(RowAddress.compareByAbsoluteAddress(this.formulaAddress!))
    const [ startSheet, endSheet ] = ends.map(e => e.sheet).sort(ParserWithCaching.compareSheetIds.bind(this))

    return {
      start: new RowAddress(startRow.type, startRow.row, startSheet),
      end: new RowAddress(endRow.type, endRow.row, endSheet),
    }
  }

  private static compareSheetIds(sheetA: number | undefined, sheetB: number | undefined): number {
    sheetA = sheetA != null ? sheetA : Infinity
    sheetB = sheetB != null ? sheetB : Infinity
    return sheetA - sheetB
  }

  public fetchCachedResultForAst(ast: Ast): ParsingResult {
    const hash = this.computeHashFromAst(ast)
    return this.fetchCachedResult(hash)
  }

  public fetchCachedResult(hash: string): ParsingResult {
    const cacheResult = this.cache.get(hash)
    if (cacheResult === undefined) {
      throw new Error('There is no AST with such key in the cache')
    } else {
      const {ast, hasVolatileFunction, hasStructuralChangeFunction, relativeDependencies} = cacheResult
      return {ast, errors: [], hasVolatileFunction, hasStructuralChangeFunction, dependencies: relativeDependencies}
    }
  }

  public computeHashFromTokens(tokens: IToken[], baseAddress: SimpleCellAddress): string {
    let hash = ''
    let idx = 0
    while (idx < tokens.length) {
      const token = tokens[idx]
      if (tokenMatcher(token, CellReference)) {
        const cellAddress = cellAddressFromString(this.sheetMapping, token.image, baseAddress)
        if (cellAddress === undefined) {
          hash = hash.concat(token.image)
        } else {
          hash = hash.concat(cellAddress.hash(true))
        }
      } else if (tokenMatcher(token, ProcedureName)) {
        const procedureName = token.image.toUpperCase().slice(0, -1)
        const canonicalProcedureName = this.lexerConfig.functionMapping[procedureName] ?? procedureName
        hash = hash.concat(canonicalProcedureName, '(')
      } else if (tokenMatcher(token, ColumnRange)) {
        const [start, end] = token.image.split(':')
        const startAddress = columnAddressFromString(this.sheetMapping, start, baseAddress)
        const endAddress = columnAddressFromString(this.sheetMapping, end, baseAddress)
        if (startAddress === undefined || endAddress === undefined) {
          hash = hash.concat('!REF')
        } else {
          hash = hash.concat(startAddress.hash(true), ':', endAddress.hash(true))
        }
      } else if (tokenMatcher(token, RowRange)) {
        const [start, end] = token.image.split(':')
        const startAddress = rowAddressFromString(this.sheetMapping, start, baseAddress)
        const endAddress = rowAddressFromString(this.sheetMapping, end, baseAddress)
        if (startAddress === undefined || endAddress === undefined) {
          hash = hash.concat('!REF')
        } else {
          hash = hash.concat(startAddress.hash(true), ':', endAddress.hash(true))
        }
      } else {
        hash = hash.concat(token.image)
      }
      idx++
    }
    return hash
  }

  public rememberNewAst(ast: Ast): Ast {
    const hash = this.computeHashFromAst(ast)
    return this.cache.maybeSetAndThenGet(hash, ast)
  }

  public computeHashFromAst(ast: Ast): string {
    return '=' + this.computeHashOfAstNode(ast)
  }

  private computeHashOfAstNode(ast: Ast): string {
    switch (ast.type) {
      case AstNodeType.EMPTY: {
        return ast.leadingWhitespace || ''
      }
      case AstNodeType.NUMBER: {
        return imageWithWhitespace(formatNumber(ast.value, this.config.decimalSeparator), ast.leadingWhitespace)
      }
      case AstNodeType.STRING: {
        return imageWithWhitespace('"' + ast.value + '"', ast.leadingWhitespace)
      }
      case AstNodeType.GAUSSIAN_NUMBER: {
        const gaussianAst = ast as any
        return imageWithWhitespace(`N(${gaussianAst.value.mean}, ${gaussianAst.value.variance})`, ast.leadingWhitespace)
      }
      case AstNodeType.NAMED_EXPRESSION: {
        return imageWithWhitespace(ast.expressionName, ast.leadingWhitespace)
      }
      case AstNodeType.FUNCTION_CALL: {
        const args = ast.args.map((arg) => this.computeHashOfAstNode(arg)).join(this.config.functionArgSeparator)
        const rightPart = ast.procedureName + '(' + args + imageWithWhitespace(')', ast.internalWhitespace)
        return imageWithWhitespace(rightPart, ast.leadingWhitespace)
      }
      case AstNodeType.CELL_REFERENCE: {
        return imageWithWhitespace(ast.reference.hash(true), ast.leadingWhitespace)
      }
      case AstNodeType.COLUMN_RANGE:
      case AstNodeType.ROW_RANGE:
      case AstNodeType.CELL_RANGE: {
        const start = ast.start.hash(ast.sheetReferenceType !== RangeSheetReferenceType.RELATIVE)
        const end = ast.end.hash(ast.sheetReferenceType === RangeSheetReferenceType.BOTH_ABSOLUTE)
        return imageWithWhitespace(start + ':' + end, ast.leadingWhitespace)
      }
      case AstNodeType.MINUS_UNARY_OP: {
        return imageWithWhitespace('-' + this.computeHashOfAstNode(ast.value), ast.leadingWhitespace)
      }
      case AstNodeType.PLUS_UNARY_OP: {
        return imageWithWhitespace('+' + this.computeHashOfAstNode(ast.value), ast.leadingWhitespace)
      }
      case AstNodeType.PERCENT_OP: {
        return this.computeHashOfAstNode(ast.value) + imageWithWhitespace('%', ast.leadingWhitespace)
      }
      case AstNodeType.ERROR: {
        const image = this.config.translationPackage.getErrorTranslation(
          ast.error ? ast.error.type : ErrorType.ERROR
        )
        return imageWithWhitespace(image, ast.leadingWhitespace)
      }
      case AstNodeType.ERROR_WITH_RAW_INPUT: {
        return imageWithWhitespace(ast.rawInput, ast.leadingWhitespace)
      }
      case AstNodeType.ARRAY: {
        const args = ast.args.map(row => row.map(val => this.computeHashOfAstNode(val)).join(',')).join(';')
        return imageWithWhitespace('{' + args + imageWithWhitespace('}', ast.internalWhitespace), ast.leadingWhitespace)
      }
      case AstNodeType.PARENTHESIS: {
        const expression = this.computeHashOfAstNode(ast.expression)
        const rightPart = '(' + expression + imageWithWhitespace(')', ast.internalWhitespace)
        return imageWithWhitespace(rightPart, ast.leadingWhitespace)
      }
      default: {
        if ('left' in ast && 'right' in ast) {
          return this.computeHashOfAstNode((ast as any).left) + imageWithWhitespace(binaryOpTokenMap[ast.type], ast.leadingWhitespace) + this.computeHashOfAstNode((ast as any).right)
        }
        return imageWithWhitespace(String((ast as any).type), (ast as any).leadingWhitespace || '')
      }
    }
  }

  public bindWhitespacesToTokens(tokens: IToken[]): ExtendedToken[] {
    const processedTokens: ExtendedToken[] = []

    const first = tokens[0]
    if (!tokenMatcher(first, this.lexerConfig.WhiteSpace)) {
      processedTokens.push(first)
    }

    for (let i = 1; i < tokens.length; ++i) {
      const current = tokens[i] as ExtendedToken
      if (tokenMatcher(current, this.lexerConfig.WhiteSpace)) {
        continue
      }

      const previous = tokens[i - 1]
      if (tokenMatcher(previous, this.lexerConfig.WhiteSpace)) {
        current.leadingWhitespace = previous
      }
      processedTokens.push(current)
    }

    return processedTokens
  }

  public tokenizeFormula(text: string): ILexingResult {
    return this.lexer.tokenizeFormula(text)
  }
}
