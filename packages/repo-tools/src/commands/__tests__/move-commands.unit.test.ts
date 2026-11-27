import fs from 'node:fs';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { buildClone, buildFakeAdapters, FAKE_HOME } from '../test-utils/fake-clones.ts';
import { buildRegistryRunner } from '../test-utils/registry-runner.ts';
import { runCaptured } from '../test-utils/run-captured.ts';
import type { CloneAdapters } from '../verb-run.ts';

const REGISTRY = `repos:
  - name: alpha
    path: ~/repos/alpha
    repo: owner/alpha
  - name: beta
    path: ~/repos/beta
    repo: owner/beta
`;

const CLONES = { alpha: buildClone({}), beta: buildClone({}) };

const run = buildRegistryRunner({ clones: CLONES, registry: REGISTRY });

describe('move', () => {
  it.each([
    [['move', 'zeta', '~/repos/zeta'], {}, 'no entry in '],
    [['move', 'alpha', '~/repos/beta'], {}, '~/repos/beta is the path of beta'],
    [['move', 'alpha', '~/repos/beta/'], {}, '~/repos/beta is the path of beta'],
    [
      ['move', 'alpha', '~/repos/delta'],
      { clones: { ...CLONES, delta: buildClone({}) } },
      `BLOCK  ${FAKE_HOME}/repos/delta already exists`,
    ],
    [['move', 'alpha', '~/repos/kit'], { clones: { beta: CLONES.beta } }, 'the clone of alpha is not on this machine'],
    [['move', 'alpha', '~/repos/kit'], { branch: 'live' }, 'which is in a worktree on the live branch'],
    [
      ['move', 'alpha', '~/repos/kit'],
      { registry: `${REGISTRY}  - name: alpha\n    path: ~/repos/alpha2\n` },
      '2 entries in ',
    ],
    [
      ['move', 'alpha', '~/repos/kit'],
      { registry: REGISTRY.replace('path: ~/repos/alpha\n', 'path: ~/repos/alpha/sub\n') },
      `~/repos/alpha/sub is not the root of a clone; the main worktree is at ${FAKE_HOME}/repos/alpha`,
    ],
  ] as const)('refuses %j before moving anything', async (args, setup, message) => {
    const { registryText, result } = await run([...args], setup);
    expect(result.stderr).toContain(message);
    expect(result.stdout).toBe('');
    expect(result.status).toBe(1);
    expect(registryText).toBe('registry' in setup ? setup.registry : REGISTRY);
  });
});

describe('move without HOME', () => {
  const ABSOLUTE = REGISTRY.replaceAll('path: ~/', () => `path: ${FAKE_HOME}/`);

  it.each([
    [['move', 'alpha', `${FAKE_HOME}/repos/kit`], REGISTRY, '~/repos/alpha'],
    [['move', 'alpha', '~/repos/kit'], ABSOLUTE, '~/repos/kit'],
    [['move', 'alpha', `${FAKE_HOME}/repos/kit`, '--search', '~/.config'], ABSOLUTE, '~/.config'],
  ] as const)('refuses %j, naming the path that needs HOME', async (args, registry, unexpandable) => {
    const { registryText, result } = await run([...args], { env: {}, registry });
    expect(result.stderr).toBe(`thor-repo: cannot expand ${unexpandable}: HOME is unset or empty`);
    expect(result.status).toBe(1);
    expect(registryText).toBe(registry);
  });

  it('plans a move between absolute paths', async () => {
    const { result } = await run(['move', 'alpha', `${FAKE_HOME}/repos/kit`, '--dry-run'], {
      env: {},
      registry: ABSOLUTE,
    });
    expect(result.stdout).toContain(`${FAKE_HOME}/repos/alpha -> ${FAKE_HOME}/repos/kit`);
    expect(result.stderr).toContain(
      'WARN   session directories not renamed: CLAUDE_CONFIG_DIR is unset, and HOME is unset or empty',
    );
    expect(result.stderr).toContain('WARN   ~ forms of the old paths not searched: HOME is unset or empty');
    expect(result.status).toBe(0);
  });
});

describe('move after a partial failure', () => {
  it('reports the moves that did not complete when the registry cannot be written either', async () => {
    using tree = createTempTree({ 'registry/repos.yaml': REGISTRY }, { prefix: 'repo-tools-' });
    const adapters: CloneAdapters = {
      ...buildFakeAdapters({ ...CLONES, 'alpha.live': buildClone({}) }),
      listWorktrees: () => [{ isPrunable: false, path: `${FAKE_HOME}/repos/alpha.live` }],
      makeDirectory: () => undefined,
      renamePath: (from) => (from.endsWith('alpha.live') ? 'EACCES' : undefined),
      repairWorktrees: () => undefined,
    };
    fs.chmodSync(tree.resolve('registry'), 0o500);
    try {
      const result = await runCaptured(
        ['move', 'alpha', '~/repos/kit', '--file', tree.resolve('registry/repos.yaml')],
        { adapters, env: { HOME: FAKE_HOME } },
      );
      expect(result.stdout).toBe('CHANGE ~/repos/alpha -> ~/repos/kit');
      expect(result.stderr.split('\n')).toStrictEqual([
        `FAIL   cannot move ${FAKE_HOME}/repos/alpha.live to ${FAKE_HOME}/repos/kit.live: EACCES`,
        '         not moved: ~/repos/alpha.live',
        expect.stringMatching(/^FAIL {3}cannot write .*repos\.yaml: EACCES/),
        '         set the path of alpha to ~/repos/kit and add ~/repos/alpha to its formerPaths by hand',
      ]);
      expect(result.status).toBe(1);
    } finally {
      fs.chmodSync(tree.resolve('registry'), 0o700);
    }
  });
});

describe('move with a failing follow-up', () => {
  it('reports the failure on stderr, records the move, and exits 0', async () => {
    const fakes = buildFakeAdapters(CLONES);
    const adapters: CloneAdapters = {
      ...fakes,
      allowDirenv: () => 'permission denied',
      makeDirectory: () => undefined,
      pathExists: (target) => target.endsWith('/.envrc') || fakes.pathExists(target),
      renamePath: () => undefined,
    };
    using tree = createTempTree({ 'repos.yaml': REGISTRY }, { prefix: 'repo-tools-' });
    const file = tree.resolve('repos.yaml');

    const result = await runCaptured(['move', '--file', file, 'alpha', '~/repos/kit'], {
      adapters,
      env: { HOME: FAKE_HOME },
    });

    expect(result.stdout.split('\n').slice(0, 2)).toStrictEqual([
      'CHANGE ~/repos/alpha -> ~/repos/kit',
      `CHANGE recorded ~/repos/kit as the path of alpha in ${fs.realpathSync(file)}`,
    ]);
    expect(result.stderr).toContain('WARN   cannot run direnv allow ~/repos/kit: permission denied\n');
    expect(fs.readFileSync(file, 'utf8')).toContain('formerPaths: [~/repos/alpha]');
    expect(result.status).toBe(0);
  });
});

describe('move --json', () => {
  it('prints the planned result under --dry-run, with the registry write that it would make', async () => {
    const { registryText, result } = await run(['move', 'alpha', '~/repos/kit', '--dry-run', '--json']);
    expect(JSON.parse(result.stdout)).toMatchObject({
      entry: 'alpha',
      isDryRun: true,
      moves: [{ from: `${FAKE_HOME}/repos/alpha`, to: `${FAKE_HOME}/repos/kit` }],
      registry: { formerPath: '~/repos/alpha', path: '~/repos/kit', status: 'planned' },
      status: 'planned',
    });
    expect(result.status).toBe(0);
    expect(registryText).toBe(REGISTRY);
  });

  it('prints a blocked result, keeping its reasons on stderr, and exits 1', async () => {
    const { result } = await run(['move', 'alpha', '~/repos/beta', '--json']);
    expect(JSON.parse(result.stdout)).toStrictEqual({
      entry: 'alpha',
      isDryRun: false,
      missingWorktrees: [],
      moves: [],
      notMoved: [],
      problems: [],
      reasons: ['~/repos/beta is the path of beta'],
      references: [],
      registry: { status: 'skipped' },
      settlement: [],
      status: 'blocked',
    });
    expect(result.stderr).toBe('BLOCK  ~/repos/beta is the path of beta');
    expect(result.status).toBe(1);
  });

  it('prints no JSON for an entry name that matches no entry', async () => {
    const { result } = await run(['move', 'zeta', '~/repos/zeta', '--json']);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/^thor-repo: no entry in .* is named zeta$/);
    expect(result.status).toBe(1);
  });
});

describe('move output style', () => {
  it('renders rich glyphs when THOR_REPO_OUTPUT_STYLE is rich', async () => {
    const { result } = await run(['move', 'alpha', '~/repos/beta'], {
      env: { HOME: FAKE_HOME, THOR_REPO_OUTPUT_STYLE: 'rich' },
    });
    expect(result.stderr).toBe('🚫 ~/repos/beta is the path of beta');
  });

  it('refuses an output style that does not exist, as a usage error', async () => {
    const { result } = await run(['move', 'alpha', '~/repos/kit'], {
      env: { HOME: FAKE_HOME, THOR_REPO_OUTPUT_STYLE: 'fancy' },
    });
    expect(result).toStrictEqual({
      status: 2,
      stderr: 'thor-repo: THOR_REPO_OUTPUT_STYLE must be one of: auto, plain, rich (got "fancy")',
      stdout: '',
    });
  });
});

describe('apply-moves', () => {
  const MOVED = `repos:
  - name: alpha
    path: ~/repos/kit
    formerPaths: [~/repos/alpha, ~/repos/old]
    repo: owner/alpha
`;
  const ORIGINS = { alpha: 'git@github.com:owner/alpha.git' };

  it('blocks an entry whose path and a former path both exist', async () => {
    const { result } = await run(['apply-moves'], {
      clones: { alpha: buildClone({}), kit: buildClone({}) },
      registry: MOVED,
    });
    expect(result).toStrictEqual({
      status: 1,
      stderr: 'BLOCK  alpha: both ~/repos/kit and a former path, ~/repos/alpha, exist',
      stdout: '',
    });
  });

  it('blocks an entry whose former paths hold more than one clone', async () => {
    const { result } = await run(['apply-moves'], {
      clones: { alpha: buildClone({}), old: buildClone({}) },
      origins: { ...ORIGINS, old: 'git@github.com:owner/alpha.git' },
      registry: MOVED,
    });
    expect(result.stderr).toBe('BLOCK  alpha: more than one former path holds its clone: ~/repos/alpha, ~/repos/old');
    expect(result.status).toBe(1);
  });

  it('blocks an entry whose path another entry also names', async () => {
    const { result } = await run(['apply-moves'], {
      clones: { alpha: buildClone({}) },
      origins: ORIGINS,
      registry: `${MOVED}  - name: kit\n    path: ~/repos/kit\n`,
    });
    expect(result.stderr).toBe('BLOCK  alpha: its path, ~/repos/kit, is also the path of kit');
    expect(result.status).toBe(1);
  });

  it('refuses a ~ former path without HOME', async () => {
    const registry = MOVED.replace('path: ~/repos/kit', () => `path: ${FAKE_HOME}/repos/kit`);
    const { result } = await run(['apply-moves'], { clones: { alpha: buildClone({}) }, env: {}, registry });
    expect(result.stderr).toBe('thor-repo: cannot expand ~/repos/alpha: HOME is unset or empty');
    expect(result.status).toBe(1);
  });

  it('ignores a former path whose clone has another origin, and reports every clone at its path', async () => {
    const { registryText, result } = await run(['apply-moves'], {
      clones: { alpha: buildClone({}) },
      origins: { alpha: 'git@github.com:owner/other.git' },
      registry: MOVED,
    });
    expect(result).toStrictEqual({
      status: 0,
      stderr: 'WARN   alpha: ignored ~/repos/alpha, which is not its clone',
      stdout: 'PASS   every registered clone on this machine is at its registered path',
    });
    expect(registryText).toBe(MOVED);
  });

  it('reports a clean run on one passed line, also under a dry run', async () => {
    for (const args of [['apply-moves'], ['apply-moves', '--dry-run']]) {
      const { result } = await run(args);
      expect(result).toStrictEqual({
        status: 0,
        stderr: '',
        stdout: 'PASS   every registered clone on this machine is at its registered path',
      });
    }
  });

  it('reports a move that fails on a failed line naming what was not moved', async () => {
    const { result } = await run(['apply-moves'], {
      clones: { alpha: buildClone({}) },
      origins: ORIGINS,
      registry: MOVED,
    });
    expect(result).toStrictEqual({
      status: 1,
      stderr: [
        `FAIL   alpha: cannot move ${FAKE_HOME}/repos/alpha to ${FAKE_HOME}/repos/kit: not exercised`,
        '         not moved: ~/repos/alpha',
      ].join('\n'),
      stdout: '',
    });
  });

  it('prints the result as JSON under --json, keeping its problems on stderr', async () => {
    const { result } = await run(['apply-moves', '--json'], {
      clones: { alpha: buildClone({}) },
      origins: ORIGINS,
      registry: MOVED,
    });
    const failure = `cannot move ${FAKE_HOME}/repos/alpha to ${FAKE_HOME}/repos/kit: not exercised`;
    expect(JSON.parse(result.stdout)).toStrictEqual({
      entries: [
        {
          entry: 'alpha',
          ignoredFormerPaths: [],
          missingWorktrees: [],
          moves: [],
          notMoved: [{ from: `${FAKE_HOME}/repos/alpha`, to: `${FAKE_HOME}/repos/kit` }],
          reasons: [failure],
          status: 'failed',
        },
      ],
      isDryRun: false,
      problems: [],
      references: [],
      settlement: [],
    });
    expect(result.stderr).toBe(`FAIL   alpha: ${failure}\n         not moved: ~/repos/alpha`);
    expect(result.status).toBe(1);
  });

  it('plans the move under --dry-run, and reports it in JSON as planned', async () => {
    const { result } = await run(['apply-moves', '--dry-run'], {
      clones: { alpha: buildClone({}) },
      origins: ORIGINS,
      registry: MOVED,
    });
    // The reference search runs git, which cannot enter the fake clones, so its warning on stderr is not asserted.
    expect({ status: result.status, stdout: result.stdout }).toStrictEqual({
      status: 0,
      stdout: [
        'INFO   would move ~/repos/alpha -> ~/repos/kit',
        'INFO   nothing moved; run without --dry-run to apply the moves',
      ].join('\n'),
    });

    const json = await run(['apply-moves', '--dry-run', '--json'], {
      clones: { alpha: buildClone({}) },
      origins: ORIGINS,
      registry: MOVED,
    });
    expect(JSON.parse(json.result.stdout)).toMatchObject({
      entries: [
        {
          entry: 'alpha',
          moves: [{ from: `${FAKE_HOME}/repos/alpha`, to: `${FAKE_HOME}/repos/kit` }],
          status: 'planned',
        },
      ],
      isDryRun: true,
    });
  });

  it('renders rich glyphs when THOR_REPO_OUTPUT_STYLE is rich', async () => {
    const { result } = await run(['apply-moves'], { env: { HOME: FAKE_HOME, THOR_REPO_OUTPUT_STYLE: 'rich' } });
    expect(result.stdout).toBe('✅ every registered clone on this machine is at its registered path');
  });

  it('refuses an output style that does not exist, as a usage error', async () => {
    const { result } = await run(['apply-moves'], { env: { HOME: FAKE_HOME, THOR_REPO_OUTPUT_STYLE: 'fancy' } });
    expect(result).toStrictEqual({
      status: 2,
      stderr: 'thor-repo: THOR_REPO_OUTPUT_STYLE must be one of: auto, plain, rich (got "fancy")',
      stdout: '',
    });
  });
});
