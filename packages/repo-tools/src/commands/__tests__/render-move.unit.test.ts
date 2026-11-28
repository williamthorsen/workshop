import { serializeReadout } from '@williamthorsen/readout';
import { describe, expect, it } from 'vitest';

import { deriveMoveStatus, type MoveResult } from '../move-result.ts';
import { renderMoveLines } from '../render-move.ts';

const HOME = '/home/me';

const WRITE = { file: `${HOME}/.config/repos.yaml`, formerPath: '~/repos/alpha', path: '~/tools/alpha' };

const MOVED = buildResult({
  missingWorktrees: [`${HOME}/repos/alpha.gone`],
  moves: [
    { from: `${HOME}/repos/alpha`, to: `${HOME}/tools/alpha` },
    { from: `${HOME}/repos/alpha.live`, to: `${HOME}/tools/alpha.live` },
  ],
  problems: ['cannot search delta: denied'],
  references: [{ file: 'notes.md', line: 3, location: 'beta', text: 'see ~/repos/alpha' }],
  registry: { ...WRITE, status: 'written' },
  settlement: [
    { action: 'remove-directory', path: `${HOME}/repos`, status: 'done' },
    { action: 'allow-direnv', path: `${HOME}/tools/alpha`, reason: 'denied', status: 'failed' },
  ],
  status: 'moved',
});

describe(renderMoveLines, () => {
  it('leads every top-level line of a completed move with its glyph and sends problems to stderr', () => {
    expect(renderMoveLines(MOVED, 'plain', HOME)).toStrictEqual([
      { stream: 'stderr', text: 'WARN   ~/repos/alpha.gone is missing; run git worktree prune to drop it' },
      { stream: 'stdout', text: 'CHANGE ~/repos/alpha -> ~/tools/alpha' },
      { stream: 'stdout', text: 'CHANGE ~/repos/alpha.live -> ~/tools/alpha.live' },
      { stream: 'stdout', text: 'CHANGE removed ~/repos' },
      { stream: 'stderr', text: 'WARN   cannot run direnv allow ~/tools/alpha: denied' },
      { stream: 'stdout', text: 'CHANGE recorded ~/tools/alpha as the path of alpha in ~/.config/repos.yaml' },
      { stream: 'stderr', text: 'WARN   cannot search delta: denied' },
      { stream: 'stdout', text: 'WARN   1 remaining reference to the old paths' },
      { stream: 'stdout', text: '         beta: notes.md:3: see ~/repos/alpha' },
    ]);
  });

  it('renders rich glyphs with the detail lines indented past their column', () => {
    const lines = renderMoveLines(MOVED, 'rich', HOME).map((line) => line.text);
    expect(lines).toContain('🔄 ~/repos/alpha -> ~/tools/alpha');
    expect(lines).toContain('🟠 1 remaining reference to the old paths');
    expect(lines).toContain('     beta: notes.md:3: see ~/repos/alpha');
  });

  it('marks the planned moves, actions, and registry write under a dry run, and ends with the footer', () => {
    const planned = buildResult({
      isDryRun: true,
      moves: [{ from: `${HOME}/repos/alpha`, to: `${HOME}/tools/alpha` }],
      registry: { ...WRITE, status: 'planned' },
      settlement: [{ action: 'remove-directory', path: `${HOME}/repos`, status: 'planned' }],
      status: 'planned',
    });
    expect(renderMoveLines(planned, 'plain', HOME).map((line) => line.text)).toStrictEqual([
      'INFO   would move ~/repos/alpha -> ~/tools/alpha',
      'INFO   would remove ~/repos',
      'INFO   would record ~/tools/alpha as the path of alpha in ~/.config/repos.yaml',
      'INFO   nothing moved; run without --dry-run to move alpha',
    ]);
    expect(deriveMoveStatus(planned)).toBe(0);
  });

  it('reports each reason of a blocked move on stderr', () => {
    const blocked = buildResult({ reasons: ['first refusal', 'second refusal'], status: 'blocked' });
    expect(renderMoveLines(blocked, 'plain', HOME)).toStrictEqual([
      { stream: 'stderr', text: 'BLOCK  first refusal' },
      { stream: 'stderr', text: 'BLOCK  second refusal' },
    ]);
    expect(deriveMoveStatus(blocked)).toBe(1);
  });

  it('reports a failed rename with the renames that it left, and the registry write that followed', () => {
    const failed = buildResult({
      moves: [{ from: `${HOME}/repos/alpha`, to: `${HOME}/tools/alpha` }],
      notMoved: [{ from: `${HOME}/repos/alpha.live`, to: `${HOME}/tools/alpha.live` }],
      reasons: ['cannot move it: busy'],
      registry: { ...WRITE, status: 'written' },
      status: 'failed',
    });
    expect(renderMoveLines(failed, 'plain', HOME)).toStrictEqual([
      { stream: 'stdout', text: 'CHANGE ~/repos/alpha -> ~/tools/alpha' },
      { stream: 'stderr', text: 'FAIL   cannot move it: busy' },
      { stream: 'stderr', text: '         not moved: ~/repos/alpha.live' },
      { stream: 'stdout', text: 'CHANGE recorded ~/tools/alpha as the path of alpha in ~/.config/repos.yaml' },
    ]);
    expect(deriveMoveStatus(failed)).toBe(1);
  });

  it('reports a failed registry write with the edit to make by hand, and fails the run', () => {
    const unwritten = buildResult({
      moves: [{ from: `${HOME}/repos/alpha`, to: `${HOME}/tools/alpha` }],
      registry: { ...WRITE, reason: 'EACCES', status: 'failed' },
      status: 'moved',
    });
    expect(renderMoveLines(unwritten, 'plain', HOME).slice(1)).toStrictEqual([
      { stream: 'stderr', text: 'FAIL   cannot write ~/.config/repos.yaml: EACCES' },
      {
        stream: 'stderr',
        text: '         set the path of alpha to ~/tools/alpha and add ~/repos/alpha to its formerPaths by hand',
      },
    ]);
    expect(deriveMoveStatus(unwritten)).toBe(1);
  });

  it('names in its text the moves and the registry path that the JSON form names', () => {
    const json: unknown = JSON.parse(serializeReadout({ data: MOVED, sensitive: [] }));
    const text = renderMoveLines(MOVED, 'plain', HOME)
      .map((line) => line.text)
      .join('\n');
    expect(json).toMatchObject({ moves: MOVED.moves, registry: { path: WRITE.path, status: 'written' } });
    for (const move of MOVED.moves) {
      expect(text).toContain(`${move.from.replace(HOME, '~')} -> ${move.to.replace(HOME, '~')}`);
    }
    expect(text).toContain(`recorded ${WRITE.path} as the path of alpha`);
    expect(deriveMoveStatus(MOVED)).toBe(0);
  });
});

// region | Helpers

/** Builds a result for the entry `alpha`, each omitted list empty and the registry write skipped. */
function buildResult(fields: Partial<MoveResult> & Pick<MoveResult, 'status'>): MoveResult {
  return {
    entry: 'alpha',
    isDryRun: false,
    missingWorktrees: [],
    moves: [],
    notMoved: [],
    problems: [],
    reasons: [],
    references: [],
    registry: { status: 'skipped' },
    settlement: [],
    ...fields,
  };
}

// endregion | Helpers
