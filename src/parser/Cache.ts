/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {AstNodeType, RelativeDependency, collectDependencies} from './'

import {Ast} from './Ast'
import {FunctionRegistry} from '../interpreter/FunctionRegistry'
import {Maybe} from '../Maybe'

export interface CacheEntry {
  ast: Ast,
  relativeDependencies: RelativeDependency[],
  hasVolatileFunction: boolean,
  hasStructuralChangeFunction: boolean,
}

const buildCacheEntry = (ast: Ast, relativeDependencies: RelativeDependency[], hasVolatileFunction: boolean, hasStructuralChangeFunction: boolean) => ({
  ast,
  relativeDependencies,
  hasVolatileFunction,
  hasStructuralChangeFunction
})

export class Cache {
  private cache: Map<string, CacheEntry> = new Map()

  constructor(
    private readonly functionRegistry: FunctionRegistry,
  ) {
  }

  public set(hash: string, ast: Ast): CacheEntry {
    const astRelativeDependencies = collectDependencies(ast, this.functionRegistry)
    const cacheEntry = buildCacheEntry(ast, astRelativeDependencies, doesContainFunctions(ast, this.functionRegistry.isFunctionVolatile), doesContainFunctions(ast, this.functionRegistry.isFunctionDependentOnSheetStructureChange))
    this.cache.set(hash, cacheEntry)
    return cacheEntry
  }

  public get(hash: string): Maybe<CacheEntry> {
    return this.cache.get(hash)
  }

  public maybeSetAndThenGet(hash: string, ast: Ast): Ast {
    const entryFromCache = this.cache.get(hash)
    if (entryFromCache !== undefined) {
      return entryFromCache.ast
    } else {
      this.set(hash, ast)
      return ast
    }
  }
}

export const doesContainFunctions = (ast: Ast, functionCriterion: (functionId: string) => boolean): boolean => {
  switch (ast.type) {
    case AstNodeType.FUNCTION_CALL: {
      return functionCriterion(ast.procedureName.toLowerCase()) || ast.args.some(arg => doesContainFunctions(arg, functionCriterion))
    }
    case AstNodeType.PARENTHESIS: {
      return doesContainFunctions(ast.expression, functionCriterion)
    }
    case AstNodeType.CELL_RANGE:
    case AstNodeType.COLUMN_RANGE:
    case AstNodeType.ROW_RANGE: {
      return false
    }
    case AstNodeType.ARRAY: {
      return ast.args.some(row => row.some(arg => doesContainFunctions(arg, functionCriterion)))
    }
    case AstNodeType.NUMBER:
    case AstNodeType.STRING:
    case AstNodeType.CELL_REFERENCE:
    case AstNodeType.NAMED_EXPRESSION:
    case AstNodeType.ERROR:
    case AstNodeType.ERROR_WITH_RAW_INPUT:
    case AstNodeType.EMPTY:
    // GAUSSIAN_NUMBER, LOG_NORMAL_NUMBER, UNIFORM_NUMBER removed
      return false
    default: {
      if ('left' in ast && 'right' in ast) {
        return doesContainFunctions(ast.left, functionCriterion) || doesContainFunctions(ast.right, functionCriterion)
      } else if ('value' in ast) {
        return doesContainFunctions(ast.value, functionCriterion)
      }
      return false
    }
  }
}
