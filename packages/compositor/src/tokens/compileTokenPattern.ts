import type { TokenKind } from '../schemas/token-kind-schemas.ts';

/**
 * Compiles a declared pattern into the expression both token surfaces match with.
 *
 * The engine supplies the flags, so a declaration cannot widen a match to span lines or to ignore case, and the render
 * side and the edge side cannot disagree about what counts as a token.
 */
export function compileTokenPattern(kind: TokenKind): RegExp {
  return new RegExp(kind.pattern, 'g');
}
