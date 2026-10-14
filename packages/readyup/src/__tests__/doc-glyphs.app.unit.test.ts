import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { RETIRED_GLYPHS } from '../test-utils/retiredGlyphs.ts';

const packageDir = path.resolve(import.meta.dirname, '../..');

/**
 * Guards the rich samples in the package's prose against glyphs that output no longer prints.
 *
 * `rdy help` renders a sample's plain form by mapping each glyph to its plain word, and a glyph that output
 * no longer prints maps to nothing, so a stale sample silently loses its status word.
 */
describe('documentation glyphs', () => {
  it('shows no retired glyph', () => {
    const findings = listProseFiles().flatMap((file) => {
      const text = readFileSync(path.join(packageDir, file), 'utf8');
      return RETIRED_GLYPHS.filter((glyph) => text.includes(glyph)).map((glyph) => `${file}: ${glyph}`);
    });

    expect(findings).toStrictEqual([]);
  });
});

// region | Helpers

/** Lists the README and every Markdown file under `docs/` and `agents/`, relative to the package root. */
function listProseFiles(): string[] {
  const nested = ['docs', 'agents'].flatMap((dir) =>
    readdirSync(path.join(packageDir, dir), { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.md'))
      .map((file) => path.join(dir, file)),
  );

  return ['README.md', ...nested];
}

// endregion | Helpers
