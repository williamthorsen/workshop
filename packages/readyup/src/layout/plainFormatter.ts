import type { Formatter } from './formatter.ts';

/**
 * A formatter whose tokens are fixed-width ASCII words.
 *
 * Every character is printable ASCII, so the output survives a CI log, a `grep`, a screen reader, and a
 * terminal with no emoji font. Each status token is a word rather than a symbol, which is what makes
 * `grep FAIL` find a failure.
 *
 * The two noun tokens carry no glyph. They name a kind of file rather than reporting an outcome, and an
 * uppercase word in the status column would read as a status; the section heading already says which kind
 * a row is. Declaring zero width still reserves the gutter, so names hold the same column as every status
 * line.
 */
export const plainFormatter: Formatter = {
  detailSeparator: '-',
  gutter: 6,
  rules: {
    kit: '=',
    section: '-',
  },
  tokens: {
    blockedPrecondition: { glyph: 'BLOCK', width: 5 },
    docCompiled: { glyph: '', width: 0 },
    docInternal: { glyph: '', width: 0 },
    failedError: { glyph: 'FAIL', width: 4 },
    failedRecommend: { glyph: 'RECO', width: 4 },
    failedWarn: { glyph: 'WARN', width: 4 },
    fix: { glyph: 'FIX', width: 3 },
    passed: { glyph: 'PASS', width: 4 },
    skippedOptional: { glyph: 'SKIP', width: 4 },
  },
};
