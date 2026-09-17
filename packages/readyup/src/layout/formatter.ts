import { defineGlyphSet, type Glyph } from '@williamthorsen/toolbelt.terminal/candidate';

/**
 * Every token given a glyph by a formatter.
 *
 * Two kinds share the list: A status token reports what became of a check, and a role token names what a
 * thing is -- a kit, a checklist, the source from which one came. Both resolve through the same vocabulary,
 * so a style declares its glyphs in one place.
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

export type HeadingLevel = 'kit' | 'section';

/** A vocabulary of status tokens and heading rule characters, from which the layout engine derives geometry. */
export interface Formatter {
  /** Character separating a check's name from its inline detail. The engine supplies the spaces around it. */
  detailSeparator: string;

  /** Label leading a remediation hint. The engine supplies the space after it. */
  hintPrefix: string;

  rules: Record<HeadingLevel, string>;

  tokens: Readonly<Record<TokenName, Glyph>>;
}

/**
 * Each token's emoji and the ASCII word that stands for it in plain output.
 *
 * Each plain status is a word rather than a symbol, so `grep FAIL` finds a failure. The role tokens have no
 * plain glyph: They name what a thing is rather than reporting an outcome, and an uppercase word in the
 * status column would read as a status. Position already says which role a name plays, whether it is a
 * heading's segment or a listed row, and a glyph of zero width still holds its column.
 */
const GLYPHS = defineGlyphSet<TokenName>({
  blockedPrecondition: { plain: 'BLOCK', rich: '\u{1F6AB}' },
  checklist: { plain: '', rich: '\u{1F4CB}' },
  failedError: { plain: 'FAIL', rich: '\u{1F534}' },
  failedRecommend: { plain: 'RECO', rich: '\u{1F7E1}' },
  failedWarn: { plain: 'WARN', rich: '\u{1F7E0}' },
  fix: { plain: 'FIX', rich: '\u{1F48A}' },
  kit: { plain: '', rich: '\u{1F4D3}' },
  kitSource: { plain: '', rich: '\u{1F4C4}' },
  passed: { plain: 'PASS', rich: '\u{1F7E2}' },
  skippedOptional: { plain: 'SKIP', rich: '\u{26AA}' },
  sourceDirectory: { plain: '', rich: '\u{1F4C1}' },
  sourcePackage: { plain: '', rich: '\u{1F4E6}' },
  sourceRemote: { plain: '', rich: '\u{1F310}' },
});

/**
 * A formatter whose output is printable ASCII throughout, so it survives a CI log, a `grep`, a screen
 * reader, and a terminal with no emoji font.
 */
export const plainFormatter: Formatter = {
  detailSeparator: '-',
  hintPrefix: 'Hint:',
  rules: {
    kit: '=',
    section: '-',
  },
  tokens: GLYPHS.plain,
};

/** A formatter whose tokens are emoji. */
export const richFormatter: Formatter = {
  detailSeparator: '\u{00B7}',
  hintPrefix: '\u{1F4A1} Hint:',
  rules: {
    kit: '\u{2501}',
    section: '\u{2500}',
  },
  tokens: GLYPHS.rich,
};
