import type { Formatter } from './formatter.ts';

/**
 * A formatter whose tokens are emoji.
 *
 * Every glyph carries `Emoji_Presentation=Yes`, so it occupies two terminal cells without a U+FE0F
 * variation selector. A glyph lacking that property renders one cell wide in some terminals and two in
 * others, so its declared width would be wrong somewhere.
 */
export const richFormatter: Formatter = {
  detailSeparator: '\u{00B7}',
  gutter: 3,
  rules: {
    kit: '\u{2501}',
    section: '\u{2500}',
  },
  tokens: {
    blockedPrecondition: { glyph: '\u{1F6AB}', width: 2 },
    docCompiled: { glyph: '\u{1F4E6}', width: 2 },
    docInternal: { glyph: '\u{1F4C4}', width: 2 },
    failedError: { glyph: '\u{1F534}', width: 2 },
    failedRecommend: { glyph: '\u{1F7E1}', width: 2 },
    failedWarn: { glyph: '\u{1F7E0}', width: 2 },
    fix: { glyph: '\u{1F48A}', width: 2 },
    passed: { glyph: '\u{1F7E2}', width: 2 },
    skippedOptional: { glyph: '\u{26AA}', width: 2 },
  },
};
