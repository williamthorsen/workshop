import { serializeReadout } from '@williamthorsen/readout';
import { describe, expect, it } from 'vitest';

import type { ApplyMovesResult, EntryOutcome } from '../apply-moves-result.ts';
import { renderApplyMovesLines } from '../render-apply-moves.ts';

const HOME = '/home/me';

const RESULT: ApplyMovesResult = {
  entries: [
    buildEntry({
      entry: 'alpha',
      ignoredFormerPaths: [`${HOME}/old/alpha`],
      missingWorktrees: [`${HOME}/repos/alpha.gone`],
      moves: [{ from: `${HOME}/repos/alpha`, to: `${HOME}/tools/alpha` }],
      status: 'moved',
    }),
    buildEntry({ entry: 'beta', reasons: ['first refusal', 'second refusal'], status: 'blocked' }),
    buildEntry({
      entry: 'gamma',
      moves: [{ from: `${HOME}/repos/gamma`, to: `${HOME}/tools/gamma` }],
      notMoved: [{ from: `${HOME}/repos/gamma.live`, to: `${HOME}/tools/gamma.live` }],
      reasons: ['cannot move it: busy'],
      status: 'failed',
    }),
  ],
  isDryRun: false,
  problems: ['cannot search delta: denied'],
  references: [{ file: 'notes.md', line: 3, location: 'alpha', text: 'see ~/repos/alpha' }],
  settlement: [
    { action: 'remove-directory', path: `${HOME}/repos`, status: 'done' },
    { action: 'allow-direnv', path: `${HOME}/tools/alpha`, reason: 'denied', status: 'failed' },
  ],
};

describe(renderApplyMovesLines, () => {
  it('leads every top-level line with its glyph and sends problems to stderr', () => {
    expect(renderApplyMovesLines(RESULT, 'plain', HOME)).toStrictEqual([
      { stream: 'stderr', text: 'WARN   alpha: ignored ~/old/alpha, which is not its clone' },
      { stream: 'stderr', text: 'WARN   ~/repos/alpha.gone is missing; run git worktree prune to drop it' },
      { stream: 'stdout', text: 'CHANGE ~/repos/alpha -> ~/tools/alpha' },
      { stream: 'stderr', text: 'BLOCK  beta: first refusal' },
      { stream: 'stderr', text: 'BLOCK  beta: second refusal' },
      { stream: 'stdout', text: 'CHANGE ~/repos/gamma -> ~/tools/gamma' },
      { stream: 'stderr', text: 'FAIL   gamma: cannot move it: busy' },
      { stream: 'stderr', text: '         not moved: ~/repos/gamma.live' },
      { stream: 'stdout', text: 'CHANGE removed ~/repos' },
      { stream: 'stderr', text: 'WARN   cannot run direnv allow ~/tools/alpha: denied' },
      { stream: 'stderr', text: 'WARN   cannot search delta: denied' },
      { stream: 'stdout', text: 'WARN   1 remaining reference to the old paths' },
      { stream: 'stdout', text: '         alpha: notes.md:3: see ~/repos/alpha' },
    ]);
  });

  it('renders rich glyphs with the detail lines indented past their column', () => {
    const lines = renderApplyMovesLines(RESULT, 'rich', HOME).map((line) => line.text);
    expect(lines).toContain('🔄 ~/repos/alpha -> ~/tools/alpha');
    expect(lines).toContain('🚫 beta: first refusal');
    expect(lines).toContain('❌ gamma: cannot move it: busy');
    expect(lines).toContain('     not moved: ~/repos/gamma.live');
  });

  it('names in its text the moves that the JSON form names', () => {
    const json: unknown = JSON.parse(serializeReadout({ data: RESULT, sensitive: [] }));
    const text = renderApplyMovesLines(RESULT, 'plain', HOME)
      .map((line) => line.text)
      .join('\n');
    const moved = RESULT.entries.flatMap((entry) => entry.moves);
    expect(json).toMatchObject({ entries: [{ moves: [moved[0]] }, { moves: [] }, { moves: [moved[1]] }] });
    for (const move of moved) {
      expect(text).toContain(`${move.from.replace(HOME, '~')} -> ${move.to.replace(HOME, '~')}`);
    }
  });

  it('marks planned moves and actions under a dry run, and ends with the footer', () => {
    const planned: ApplyMovesResult = {
      ...RESULT,
      entries: [buildEntry({ entry: 'alpha', moves: [{ from: `${HOME}/a`, to: `${HOME}/b` }], status: 'planned' })],
      isDryRun: true,
      problems: [],
      references: [],
      settlement: [{ action: 'remove-directory', path: `${HOME}/repos`, status: 'planned' }],
    };
    expect(renderApplyMovesLines(planned, 'plain', HOME).map((line) => line.text)).toStrictEqual([
      'INFO   would move ~/a -> ~/b',
      'INFO   would remove ~/repos',
      'INFO   nothing moved; run without --dry-run to apply the moves',
    ]);
  });
});

// region | Helpers

/** Builds an entry outcome, each omitted list empty. */
function buildEntry(outcome: Partial<EntryOutcome> & Pick<EntryOutcome, 'entry' | 'status'>): EntryOutcome {
  return { ignoredFormerPaths: [], missingWorktrees: [], moves: [], notMoved: [], reasons: [], ...outcome };
}

// endregion | Helpers
