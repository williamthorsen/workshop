import { describe, expect, it } from 'vitest';

import { TOKEN_NAMES } from '../../src/layout/formatter.ts';
import { createLayoutEngine } from '../../src/layout/layoutEngine.ts';
import { plainFormatter } from '../../src/layout/plainFormatter.ts';
import type { SummaryCounts } from '../../src/types.ts';

/** Every printable ASCII character, plus the newline that separates rendered lines. */
const PRINTABLE_ASCII = /^[\x20-\x7E\n]*$/;

/** Tokens that name a kind of file rather than reporting an outcome. */
const NOUN_TOKENS = ['docCompiled', 'docInternal'] as const;

const engine = createLayoutEngine(plainFormatter);

const entries = TOKEN_NAMES.map((name) => ({ name, ...plainFormatter.tokens[name] }));

function makeCounts(overrides?: Partial<SummaryCounts>): SummaryCounts {
  return {
    passed: 0,
    errors: 0,
    warnings: 0,
    recommendations: 0,
    blocked: 0,
    optional: 0,
    worstSeverity: null,
    ...overrides,
  };
}

/** Returns the display column at which a rendered line's name begins. */
function measureNameColumn(line: string): number {
  const match = /^(?<indent> *)(?<word>[A-Z]*)(?<pad> +)/u.exec(line);
  const groups = match?.groups;
  if (groups === undefined) throw new Error(`Not a token-led line: ${JSON.stringify(line)}`);

  return (groups.indent?.length ?? 0) + (groups.word?.length ?? 0) + (groups.pad?.length ?? 0);
}

/** Returns a line's count of leading spaces, one per column. */
function measureIndent(line: string): number {
  return line.length - line.trimStart().length;
}

/** Returns every line the engine can produce, so a whole-vocabulary assertion has something to run against. */
function renderEverything(): string {
  const counts = makeCounts({ passed: 2, errors: 1, warnings: 1, recommendations: 1, blocked: 1, optional: 1 });

  return [
    ...TOKEN_NAMES.map((token) =>
      engine.formatCheckLine({ token, name: 'check', detail: 'detail', progress: '50%', durationMs: 250, depth: 1 }),
    ),
    ...engine.formatHeading('deploy', 'kit'),
    ...engine.formatHeading('build', 'section'),
    ...engine.formatReasonBlock(['a reason'], 2),
    engine.formatCountLine(counts, 800),
    ...engine.formatSummaryTable({
      rows: [
        { name: 'build', counts: makeCounts({ passed: 2 }), durationMs: 410 },
        { name: 'integration', counts, durationMs: 1400 },
      ],
      totals: counts,
      totalDurationMs: 1810,
    }),
    ...TOKEN_NAMES.map((token) => engine.inlineGlyph(token)),
  ].join('\n');
}

describe('plainFormatter', () => {
  it('supplies a token for every semantic state and no others', () => {
    expect(new Set(Object.keys(plainFormatter.tokens))).toStrictEqual(new Set<string>(TOKEN_NAMES));
  });

  it('distinguishes the heading levels by rule character', () => {
    expect(plainFormatter.rules.kit).not.toBe(plainFormatter.rules.section);
  });

  it('leaves room for a separating space after the widest token', () => {
    const widest = Math.max(...entries.map((entry) => entry.width));

    expect(plainFormatter.gutter).toBeGreaterThan(widest);
  });

  describe.each(entries)('$name', ({ glyph, width }) => {
    it('declares the width it occupies', () => {
      expect(width).toBe(glyph.length);
    });
  });

  it.each(NOUN_TOKENS)('gives %s no glyph, so it is omitted rather than substituted', (token) => {
    expect(plainFormatter.tokens[token].glyph).toBe('');
  });
});

describe('rendered output', () => {
  it('is printable ASCII throughout', () => {
    expect(renderEverything()).toMatch(PRINTABLE_ASCII);
  });

  it('spells each status as a word a log search can find', () => {
    expect(engine.formatCheckLine({ token: 'failedError', name: 'migrations' })).toBe('FAIL  migrations');
  });

  it('reserves the gutter for a token carrying no glyph, so names stay in one column', () => {
    const noun = engine.formatCheckLine({ token: 'docCompiled', name: 'deploy' });
    const status = engine.formatCheckLine({ token: 'passed', name: 'deploy' });

    expect(measureNameColumn(noun)).toBe(measureNameColumn(status));
    expect(noun).toBe('      deploy');
  });

  it('parts a detail from the name with an ASCII separator', () => {
    expect(engine.formatCheckLine({ token: 'failedWarn', name: 'lint', detail: 'not installed' })).toBe(
      'WARN  lint - not installed',
    );
  });

  it('heads a section with an ASCII rule', () => {
    expect(engine.formatHeadingLine('code-quality', 'section')).toBe('-- code-quality');
    expect(engine.formatHeadingLine('deploy', 'kit')).toBe('== deploy');
  });
});

describe('alignment', () => {
  it('starts each nesting level one gutter right of the level above', () => {
    const columns = [0, 1, 2, 3].map((depth) =>
      measureNameColumn(engine.formatCheckLine({ token: 'passed', name: 'check', depth })),
    );

    expect(columns).toStrictEqual([6, 12, 18, 24]);
  });

  it('puts a child token under its parent name at every level', () => {
    for (const depth of [0, 1, 2, 3]) {
      const parent = engine.formatCheckLine({ token: 'passed', name: 'parent', depth });
      const child = engine.formatCheckLine({ token: 'blockedPrecondition', name: 'child', depth: depth + 1 });

      expect(measureIndent(child)).toBe(measureNameColumn(parent));
    }
  });

  it('lands the name at one column whichever token leads the line', () => {
    const columns = TOKEN_NAMES.map((token) =>
      measureNameColumn(engine.formatCheckLine({ token, name: 'check', depth: 2 })),
    );

    expect(new Set(columns)).toStrictEqual(new Set([plainFormatter.gutter * 3]));
  });

  it('holds the column through three levels of nesting, widest token included', () => {
    const rendered = [
      engine.formatCheckLine({ token: 'failedError', name: 'bitbucket-pipelines.yml exists' }),
      engine.formatCheckLine({ token: 'blockedPrecondition', name: 'pipeline runs checks', depth: 1 }),
      engine.formatCheckLine({ token: 'skippedOptional', name: 'branch-protection query', depth: 2 }),
    ].join('\n');

    expect(rendered).toBe(
      [
        'FAIL  bitbucket-pipelines.yml exists',
        '      BLOCK pipeline runs checks',
        '            SKIP  branch-protection query',
      ].join('\n'),
    );
  });
});
