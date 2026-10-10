import fs from 'node:fs';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import type { ThorNodeEffects } from '../run.ts';
import { parseActiveDays, runPruneModules } from '../runPruneModules.ts';
import { runWithBuffers } from '../test-utils/runWithBuffers.ts';

const DAY_MS = 24 * 60 * 60 * 1_000;
const NOW = Date.parse('2026-10-06T00:00:00Z');
const PROTECT_LIST = '.config/thor-node/protected-node-modules.txt';

describe(runPruneModules, () => {
  it('reports what it would delete, with sizes and a total, and deletes nothing', async () => {
    using tree = createProjects();

    const { exitCode, stderr, stdout } = await runWithBuffers(['prune-modules'], buildEffects(tree));

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    const lines = stdout.split('\n');
    expect(lines[0]).toBe(`protect-list: ${tree.resolve(PROTECT_LIST)}`);
    expect(lines[1]).toMatch(
      new RegExp(String.raw`^\s*skipped  ${tree.resolve('repos/active/node_modules')} \(active 3 days ago\)$`),
    );
    expect(lines[2]).toMatch(
      new RegExp(
        String.raw`^\s*skipped  ${tree.resolve('repos/keep.live/node_modules')} \(protected by ~/repos/\*\.live\)$`,
      ),
    );
    expect(lines[3]).toMatch(
      new RegExp(String.raw`^\s*\d+(?:\.\d)? k?B  ${tree.resolve('repos/stale/node_modules')}$`),
    );
    expect(lines[5]).toMatch(/^1 directory totaling \d+(?:\.\d)? k?B would be deleted; 2 skipped$/);
    expect(listRemaining(tree)).toStrictEqual(['active', 'keep.live', 'stale']);
  });

  it('deletes only the candidates under --apply --no-confirm', async () => {
    using tree = createProjects();

    const { exitCode, stdout } = await runWithBuffers(['prune-modules', '--apply', '--no-confirm'], buildEffects(tree));

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/\n1 directory totaling \d+(?:\.\d)? k?B deleted; 2 skipped\n$/);
    expect(listRemaining(tree)).toStrictEqual(['active', 'keep.live']);
  });

  it('deletes after an affirmative answer', async () => {
    using tree = createProjects();
    const questions: string[] = [];
    const effects = buildEffects(tree, {
      isStdinTty: () => true,
      readAnswer: (question) => {
        questions.push(question);
        return Promise.resolve(' YES ');
      },
    });

    const { exitCode } = await runWithBuffers(['prune-modules', '--apply'], effects);

    expect(exitCode).toBe(0);
    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatch(/^Delete 1 directory totaling \d+(?:\.\d)? k?B\? \[y\/N\] $/);
    expect(listRemaining(tree)).toStrictEqual(['active', 'keep.live']);
  });

  it.each([['n'], [''], [undefined]])('deletes nothing and exits 1 when the answer is %o', async (answer) => {
    using tree = createProjects();
    const effects = buildEffects(tree, { isStdinTty: () => true, readAnswer: () => Promise.resolve(answer) });

    const { exitCode, stderr } = await runWithBuffers(['prune-modules', '--apply'], effects);

    expect(exitCode).toBe(1);
    expect(stderr).toBe('Nothing deleted.\n');
    expect(listRemaining(tree)).toStrictEqual(['active', 'keep.live', 'stale']);
  });

  it('refuses --apply without a terminal unless --no-confirm is given', async () => {
    using tree = createProjects();

    const { exitCode, stderr } = await runWithBuffers(['prune-modules', '--apply'], buildEffects(tree));

    expect(exitCode).toBe(2);
    expect(stderr).toContain('Confirming --apply needs a terminal on stdin');
    expect(listRemaining(tree)).toStrictEqual(['active', 'keep.live', 'stale']);
  });

  it('applies without prompting when nothing is a candidate', async () => {
    using tree = createTempTree({ 'repos/.keep': '' });
    const effects = buildEffects(tree, {
      isStdinTty: () => true,
      readAnswer: () => Promise.reject(new Error('asked')),
    });

    const { exitCode, stdout } = await runWithBuffers(['prune-modules', '--apply'], effects);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('0 directories totaling 0 B deleted; 0 skipped');
  });

  it('exits 3 when the root does not exist', async () => {
    using tree = createTempTree({});

    const { exitCode, stderr, stdout } = await runWithBuffers(['prune-modules'], buildEffects(tree));

    expect(exitCode).toBe(3);
    expect(stderr).toBe(`Root ${tree.resolve('repos')} is not an existing directory; nothing to prune.\n`);
    expect(stdout).toBe('');
  });

  it.each([
    ['through the symlinked root', '~/linked/*.live'],
    ['by its real path', '~/repos/*.live'],
  ])('protects a project that a pattern names %s', async (_, pattern) => {
    using tree = createProjects();
    tree.symlink('linked', tree.resolve('repos'));
    tree.write(PROTECT_LIST, `${pattern}\n`);

    const { stdout } = await runWithBuffers(['prune-modules', '--root', tree.resolve('linked')], buildEffects(tree));

    expect(stdout).toContain(`${tree.resolve('linked/keep.live/node_modules')} (protected by ${pattern})`);
  });

  it('resolves --root and --protect-list against the working directory', async () => {
    using tree = createProjects();
    tree.write('elsewhere/list.txt', '~/repos/stale\n');
    const effects = buildEffects(tree, { cwd: tree.dir });

    const { stdout } = await runWithBuffers(
      ['prune-modules', '--root', 'repos', '--protect-list', 'elsewhere/list.txt'],
      effects,
    );

    expect(stdout).toContain(`protect-list: ${tree.resolve('elsewhere/list.txt')}\n`);
    expect(stdout).toContain('(protected by ~/repos/stale)');
    expect(stdout).toContain('1 directory totaling');
  });

  it('protects nothing when the default protect-list is missing', async () => {
    using tree = createProjects();
    tree.rm(PROTECT_LIST);

    const { stdout } = await runWithBuffers(['prune-modules'], buildEffects(tree));

    expect(stdout).toContain(`protect-list: ${tree.resolve(PROTECT_LIST)} (not found; nothing protected)\n`);
    expect(stdout).toContain('2 directories totaling');
  });

  it('rejects a missing protect-list that the user named', async () => {
    using tree = createProjects();
    const missing = tree.resolve('absent.txt');

    const { exitCode, stderr } = await runWithBuffers(['prune-modules', '--protect-list', missing], buildEffects(tree));

    expect(exitCode).toBe(2);
    expect(stderr).toContain(`Protect-list not found: ${missing}`);
  });

  it('keeps no directory for activity under --no-active-guard', async () => {
    using tree = createProjects();

    const { stdout } = await runWithBuffers(['prune-modules', '--no-active-guard'], buildEffects(tree));

    expect(stdout).not.toContain('(active');
    expect(stdout).toContain('2 directories totaling');
  });

  it('narrows the active window with --active-days', async () => {
    using tree = createProjects();

    const { stdout } = await runWithBuffers(['prune-modules', '--active-days', '2'], buildEffects(tree));

    expect(stdout).toContain('2 directories totaling');
  });

  it('rejects --active-days combined with --no-active-guard', async () => {
    using tree = createProjects();

    const { exitCode, stderr } = await runWithBuffers(
      ['prune-modules', '--active-days', '5', '--no-active-guard'],
      buildEffects(tree),
    );

    expect(exitCode).toBe(2);
    expect(stderr).toContain('--active-days cannot be combined with --no-active-guard.');
  });

  it('reports a failed deletion, continues with the rest, and exits 1', async () => {
    using tree = createProjects();
    tree.mkdir('repos/locked/node_modules/pkg');
    tree.write('repos/locked/.git/index', '');
    fs.utimesSync(tree.resolve('repos/locked/.git/index'), new Date(NOW - 100 * DAY_MS), new Date(NOW - 100 * DAY_MS));
    fs.chmodSync(tree.resolve('repos/locked'), 0o555);

    const { exitCode, stderr, stdout } = await runWithBuffers(
      ['prune-modules', '--apply', '--no-confirm'],
      buildEffects(tree),
    );

    expect(exitCode).toBe(1);
    expect(stderr).toContain(`failed to delete ${tree.resolve('repos/locked/node_modules')}: `);
    expect(stdout).toMatch(/\n1 directory totaling .* deleted; 2 skipped\n$/);
    expect(tree.exists('repos/stale/node_modules')).toBe(false);
  });
});

describe(parseActiveDays, () => {
  it('accepts a positive whole number', () => {
    expect(parseActiveDays('7')).toBe(7);
  });

  it.each([['0'], ['-1'], ['1.5'], ['abc'], ['']])('rejects %o', (raw) => {
    expect(() => parseActiveDays(raw)).toThrow('must be a positive whole number of days');
  });
});

// region | Helpers

/**
 * Creates three projects under `repos/`: one active three days ago, one protected by the default protect-list, and one
 * stale for a hundred days, each with a git index whose mtime records its activity.
 */
function createProjects(): TempTree {
  const tree = createTempTree({
    [PROTECT_LIST]: '# kept\n~/repos/*.live\n',
    'repos/active/.git/index': '',
    'repos/active/node_modules/pkg/index.js': 'x'.repeat(4_096),
    'repos/keep.live/.git/index': '',
    'repos/keep.live/node_modules/pkg/index.js': 'x'.repeat(4_096),
    'repos/stale/.git/index': '',
    'repos/stale/node_modules/pkg/index.js': 'x'.repeat(4_096),
  });
  setActivity(tree, 'repos/active', NOW - 3 * DAY_MS);
  setActivity(tree, 'repos/keep.live', NOW - 100 * DAY_MS);
  setActivity(tree, 'repos/stale', NOW - 100 * DAY_MS);

  return tree;
}

/** Builds effects whose home directory is the tree, with no terminal on stdin and the clock at `NOW`. */
function buildEffects(tree: TempTree, overrides: Partial<ThorNodeEffects> = {}): ThorNodeEffects {
  return {
    cwd: tree.dir,
    execPath: '/usr/local/bin/node',
    findPin: () => undefined,
    homeDir: tree.dir,
    isStdinTty: () => false,
    listStrandedShims: () => [],
    now: () => NOW,
    pathDirs: [],
    readAnswer: () => Promise.resolve(undefined),
    resolvePnpmProvider: () => ({ kind: 'absent' }),
    resolveVersion: () => '0.0.0',
    runPnpmVersion: () => ({ failure: 'not run' }),
    ...overrides,
  };
}

/** Lists the projects under `repos/` that still have a `node_modules` directory. */
function listRemaining(tree: TempTree): string[] {
  return tree.list('repos').filter((project) => tree.exists(`repos/${project}/node_modules`));
}

/** Sets a project's git index mtime, which records its last activity. */
function setActivity(tree: TempTree, project: string, time: number): void {
  const date = new Date(time);
  fs.utimesSync(tree.resolve(`${project}/.git/index`), date, date);
}

// endregion | Helpers
