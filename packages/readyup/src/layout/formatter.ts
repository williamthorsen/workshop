/**
 * Every token a formatter gives a glyph.
 *
 * Two kinds share the list: a status token reports what became of a check, and a role token names what a
 * thing is -- a kit, a checklist, the source one came from. Both resolve through the same vocabulary, so a
 * style declares its glyphs in one place.
 */
export const TOKEN_NAMES = [
  'blockedPrecondition',
  'checklist',
  'failedError',
  'failedRecommend',
  'failedWarn',
  'fix',
  'kit',
  'kitSource',
  'passed',
  'skippedOptional',
  'sourceDirectory',
  'sourcePackage',
  'sourceRemote',
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
  /** Character separating a check's name from its inline detail. The engine supplies the spaces around it. */
  detailSeparator: string;

  /** Columns from the start of a status token to the start of the name beside it. Exceeds every token's width. */
  gutter: number;

  /** Label leading a remediation hint. The engine supplies the space after it. */
  hintPrefix: string;

  rules: Record<HeadingLevel, string>;

  tokens: Record<TokenName, LayoutToken>;
}
