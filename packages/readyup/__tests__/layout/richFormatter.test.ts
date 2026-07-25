import { describe, expect, it } from 'vitest';

import { richFormatter } from '../../src/layout/richFormatter.ts';
import { TOKEN_NAMES } from '../../src/layout/formatter.ts';

const VARIATION_SELECTOR_16 = '\u{FE0F}';

/** Glyphs no token may use, each stripped of any variation selector. */
const RETIRED_GLYPHS = ['\u{23ED}', '\u{2705}', '\u{26A0}', '\u{274C}', '\u{2753}', '\u{2796}'];

const entries = TOKEN_NAMES.map((name) => ({ name, ...richFormatter.tokens[name] }));

describe('richFormatter', () => {
  it('supplies a token for every semantic state and no others', () => {
    expect(new Set(Object.keys(richFormatter.tokens))).toStrictEqual(new Set<string>(TOKEN_NAMES));
  });

  it('retires the glyphs the unified vocabulary replaced', () => {
    const glyphs = entries.map((entry) => entry.glyph);

    for (const retired of RETIRED_GLYPHS) {
      expect(glyphs).not.toContain(retired);
    }
  });

  it('distinguishes the heading levels by rule weight', () => {
    expect(richFormatter.rules.kit).not.toBe(richFormatter.rules.section);
  });

  it('leaves room for a separating space after the widest token', () => {
    const widest = Math.max(...entries.map((entry) => entry.width));

    expect(richFormatter.gutter).toBeGreaterThan(widest);
  });

  describe.each(entries)('$name', ({ glyph, width }) => {
    it('declares a width of two cells', () => {
      expect(width).toBe(2);
    });

    it('carries no variation selector', () => {
      expect(glyph).not.toContain(VARIATION_SELECTOR_16);
    });

    // `Emoji_Presentation` is the property that makes a code point occupy two cells unaided, so the
    // match verifies the declared width. Anchoring to one property also rejects multi-code-point sequences.
    it('is one code point that renders wide unaided', () => {
      expect(glyph).toMatch(/^\p{Emoji_Presentation}$/u);
    });
  });
});
