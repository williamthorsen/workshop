/** Every semantic state a status token can name. */
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

export type TokenName = (typeof TOKEN_NAMES)[number];

/** A glyph together with the number of terminal cells it occupies. */
export interface LayoutToken {
  glyph: string;
  width: number;
}

export type HeadingLevel = 'kit' | 'section';

/** A vocabulary of status tokens and heading rule characters, from which the layout engine derives geometry. */
export interface Formatter {
  /** Character parting a check's name from its inline detail. The engine supplies the spaces around it. */
  detailSeparator: string;

  /** Columns from the start of a status token to the start of the name beside it. Exceeds every token's width. */
  gutter: number;

  /** Label leading a remediation hint. The engine supplies the space after it. */
  hintPrefix: string;

  rules: Record<HeadingLevel, string>;

  tokens: Record<TokenName, LayoutToken>;
}
