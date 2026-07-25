import type { Formatter } from './formatter.ts';

/**
 * The emoji vocabulary: nine glyphs that each occupy two terminal cells with no variation selector.
 *
 * Every glyph has `Emoji_Presentation=Yes`, so it renders wide on its own and the gutter is a fixed
 * three columns everywhere. A glyph needing U+FE0F to render as emoji is two cells in some terminals
 * and one in others, which is why the retired `⏭️` and `⚠️` tokens each needed a hand-placed
 * compensating space at their call site. Escapes rather than literals keep that property auditable.
 */
export const emojiFormatter: Formatter = {
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
