import {AstNodeType} from '../parser/Ast'

export function transformAst(ast: any): any {
  // Add a case for GAUSSIAN_NUMBER
  switch (ast.type) {
    case AstNodeType.NUMBER:
    case AstNodeType.STRING:
    case AstNodeType.EMPTY:
    case AstNodeType.ERROR:
    case AstNodeType.GAUSSIAN_NUMBER:
      return ast
    case AstNodeType.LOG_NORMAL_NUMBER:
      return ast
    case AstNodeType.UNIFORM_NUMBER:
      return ast
    // ... rest of the cases ...
  }
  return ast
} 