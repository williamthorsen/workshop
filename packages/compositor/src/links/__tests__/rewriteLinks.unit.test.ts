import { describe, expect, it } from 'vitest';

import type { TokenKind } from '../../schemas/token-kind-schemas.ts';
import type { Segment } from '../../transclusion/expandTransclusions.ts';
import type { LinkRewrite, RewriteLinksInput } from '../rewriteLinks.ts';
import { rewriteLinks } from '../rewriteLinks.ts';

const MARKDOWN_LINK = String.raw`\[[^\]]*\]\(([^)]+)\)`;

const tokenKinds: ReadonlyArray<TokenKind> = [
  { id: 'variable', label: 'Variable', form: 'mapping', pattern: String.raw`\{([a-z_]+)\}` },
];

describe(rewriteLinks, () => {
  it('rewrites a relative target to the absolute path it deploys at', () => {
    const result = rewrite(['See [the rubric](./rubric.md).']);

    expect(lines(result)).toStrictEqual(['See [the rubric](~/.claude/skills/review/rubric.md).']);
  });

  it("resolves a target that climbs into another kind's tree to where that kind deploys", () => {
    const result = rewrite(['See [the rulebook](../../rulebooks/consult-shell.md).']);

    expect(lines(result)).toStrictEqual(['See [the rulebook](~/.claude/rulebooks/consult-shell.md).']);
  });

  it('rewrites every link on a line to its own target', () => {
    const result = rewrite(['[a](./a.md) and [b](../lint/b.md)']);

    expect(lines(result)).toStrictEqual(['[a](~/.claude/skills/review/a.md) and [b](~/.claude/skills/lint/b.md)']);
  });

  it('replaces the target alone, leaving every other character on the line byte-identical', () => {
    const result = rewrite(['Cost [$& per **unit**](./price.md) — see $1.']);

    expect(lines(result)).toStrictEqual(['Cost [$& per **unit**](~/.claude/skills/review/price.md) — see $1.']);
  });

  it('keeps the fragment on a target it resolves', () => {
    const result = rewrite(['[x](./rubric.md#scoring)']);

    expect(lines(result)).toStrictEqual(['[x](~/.claude/skills/review/rubric.md#scoring)']);
  });

  it.each([
    ['an anchor', '#scoring'],
    ['an absolute path', '/etc/hosts'],
    ['a home-relative path', '~/.claude/skills/lint/SKILL.md'],
    ['a web URL', 'https://example.com/x'],
    ['a mail address, which the ported original resolved as a path', 'mailto:team@example.com'],
    ['a target opening with a declared token', '{harness_home_dir}/CLAUDE.md'],
  ])('leaves %s untouched', (_label, target) => {
    const result = rewrite([`[x](${target})`]);

    expect(lines(result)).toStrictEqual([`[x](${target})`]);
    expect(result.diagnostics).toStrictEqual([]);
  });

  it('matches no link across a line boundary, whatever the declared grammar admits', () => {
    const result = rewrite(['Text with a stray [', '](./rubric.md)']);

    expect(lines(result)).toStrictEqual(['Text with a stray [', '](./rubric.md)']);
  });

  it('reads the grammar from the declaration, so a non-Markdown convention needs no engine change', () => {
    const result = rewrite(['see: (./rubric.md)'], { pattern: String.raw`see: \(([^)]+)\)` });

    expect(lines(result)).toStrictEqual(['see: (~/.claude/skills/review/rubric.md)']);
  });

  it('resolves against a destination root that is a plain path rather than a home-relative one', () => {
    const result = rewrite(['[x](./rubric.md)'], { targetRoot: '/srv/out' });

    expect(lines(result)).toStrictEqual(['[x](/srv/out/skills/review/rubric.md)']);
  });

  it('passes a home-relative target through whatever the root is, since it names the home either way', () => {
    const result = rewrite(['[x](~/notes/y.md)'], { targetRoot: '/srv/out' });

    expect(lines(result)).toStrictEqual(['[x](~/notes/y.md)']);
  });

  it('resolves against the destination root for a file sitting directly at that root', () => {
    const result = rewrite(['[x](./skills/review/SKILL.md)'], { filePath: 'CLAUDE.md' });

    expect(lines(result)).toStrictEqual(['[x](~/.claude/skills/review/SKILL.md)']);
  });

  describe('a target climbing above the destination root', () => {
    it('stays in the body as written', () => {
      const result = rewrite(['[x](../../../elsewhere/x.md)']);

      expect(lines(result)).toStrictEqual(['[x](../../../elsewhere/x.md)']);
    });

    it('comes back as a diagnostic naming the host and the target', () => {
      const result = rewrite(['[x](../../../elsewhere/x.md)']);

      expect(result.diagnostics).toStrictEqual([
        {
          code: 'out-of-tree',
          message: 'The link "../../../elsewhere/x.md" in skill:review resolves above ~/.claude.',
          at: { host: 'skill:review', target: '../../../elsewhere/x.md' },
        },
      ]);
    });

    it('names the partial it arrived through', () => {
      const segments: ReadonlyArray<Segment> = [
        { lines: ['[x](../../../elsewhere/x.md)'], partialId: 'team:_data/shared.md' },
      ];

      const result = rewriteLinks({ ...baseInput, segments });

      expect(result.diagnostics[0]?.at.partialId).toBe('team:_data/shared.md');
    });
  });

  it('keeps each segment attributed to the file its lines came from', () => {
    const segments: ReadonlyArray<Segment> = [
      { lines: ['[a](./a.md)'] },
      { lines: ['[b](./b.md)'], partialId: 'team:_data/shared.md' },
    ];

    const result = rewriteLinks({ ...baseInput, segments });

    expect(result.segments).toStrictEqual([
      { lines: ['[a](~/.claude/skills/review/a.md)'] },
      { lines: ['[b](~/.claude/skills/review/b.md)'], partialId: 'team:_data/shared.md' },
    ]);
  });
});

// region | Helpers

const baseInput: RewriteLinksInput = {
  segments: [],
  pattern: MARKDOWN_LINK,
  tokenKinds,
  filePath: 'skills/review/SKILL.md',
  targetRoot: '~/.claude',
  host: 'skill:review',
};

/** Reads back the rendered lines, which every resolution assertion is stated in terms of. */
function lines(result: LinkRewrite): ReadonlyArray<string> {
  return result.segments.flatMap((segment) => segment.lines);
}

/** Rewrites one unattributed segment's lines, overriding whichever inputs a case varies. */
function rewrite(bodyLines: ReadonlyArray<string>, overrides: Partial<RewriteLinksInput> = {}): LinkRewrite {
  return rewriteLinks({ ...baseInput, segments: [{ lines: bodyLines }], ...overrides });
}

// endregion | Helpers
