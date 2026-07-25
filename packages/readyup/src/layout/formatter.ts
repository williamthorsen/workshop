/**
 * Every semantic state a status token can name.
 *
 * The set is closed, which is what lets a formatter declare each token's cell width instead of
 * measuring it: a new state is a deliberate addition here, not something a caller invents. Declared
 * as data so a formatter's token map can be checked against it at runtime, not only by the compiler.
 */
export const TOKEN_NAMES = [
  'blockedPrecondition',
  'docCompiled',
  'docInternal',
  'failedError',
  'failedRecommend',
  'failedWarn',
  'fix',
  'passed',
  'skippedOptional',
] as const;

/** A semantic state a status token can name. */
export type TokenName = (typeof TOKEN_NAMES)[number];

/** A glyph together with the number of terminal cells it occupies. */
export interface LayoutToken {
  glyph: string;
  width: number;
}

/** Heading weights, each naming a nesting level rather than a specific command's vocabulary. */
export type HeadingLevel = 'kit' | 'section';

/**
 * A token vocabulary and rule characters. Formatters own only these; the layout engine owns every
 * geometric decision made from them, so two formatters cannot disagree about spacing or alignment.
 */
export interface Formatter {
  /**
   * Columns from the start of a status token to the start of the name beside it.
   *
   * Doubles as the indent unit, which is what puts each child's token under its parent's name. It
   * must exceed every token's width, since the difference is the separating space.
   */
  gutter: number;

  rules: Record<HeadingLevel, string>;

  tokens: Record<TokenName, LayoutToken>;
}
