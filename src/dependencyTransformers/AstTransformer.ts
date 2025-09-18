import {AstNodeType} from '../parser/Ast'

export function transformAst(ast: any): any {
  // GAUSSIAN_NUMBER, LOG_NORMAL_NUMBER, UNIFORM_NUMBER removed
  switch (ast.type) {
    case AstNodeType.NUMBER:
    case AstNodeType.STRING:
    case AstNodeType.EMPTY:
    case AstNodeType.ERROR:
    // GAUSSIAN_NUMBER, LOG_NORMAL_NUMBER, UNIFORM_NUMBER removed
    // ... rest of the cases ...
  }
  return ast
} 