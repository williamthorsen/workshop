import fs from 'node:fs';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { buildClone, buildFakeAdapters, FAKE_HOME, type FakeClone } from '../test-utils/fake-clones.ts';
import { type CapturedRun, runCaptured } from '../test-utils/run-captured.ts';
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

describe('move', () => {
  it.each([
    [['move', 'zeta', '~/repos/zeta'], {}, 'no entry in '],
    [['move', 'alpha', '~/repos/beta'], {}, '~/repos/beta is the path of beta'],
    [['move', 'alpha', '~/repos/beta/'], {}, '~/repos/beta is the path of beta'],
    [
      ['move', 'alpha', '~/repos/delta'],
      { clones: { ...CLONES, delta: buildClone({}) } },
      `${FAKE_HOME}/repos/delta already exists; nothing moved`,
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
      expect(result.stdout).toBe('~/repos/alpha -> ~/repos/kit');
      expect(result.stderr).toContain('thor-repo: not moved: ~/repos/alpha.live\n');
      expect(result.stderr).toContain(
        `cannot move ${FAKE_HOME}/repos/alpha.live to ${FAKE_HOME}/repos/kit.live: EACCES`,
      );
      expect(result.stderr).toContain(
        'set the path of alpha to ~/repos/kit and add ~/repos/alpha to its formerPaths by hand',
      );
      expect(result.status).toBe(1);
    } finally {
      fs.chmodSync(tree.resolve('registry'), 0o700);
    }
  });
});

describe('apply-moves', () => {
  const MOVED = `repos:
  - name: alpha
    path: ~/repos/kit
    formerPaths: [~/repos/alpha, ~/repos/old]
    repo: owner/alpha
`;

  it('skips an entry whose path and a former path both exist', async () => {
    const { result } = await run(['apply-moves'], {
      clones: { alpha: buildClone({}), kit: buildClone({}) },
      registry: MOVED,
    });
    expect(result.stderr).toBe(
      'thor-repo: alpha: both ~/repos/kit and a former path, ~/repos/alpha, exist; skipped\nthor-repo: nothing to move',
    );
    expect(result.status).toBe(1);
  });

  it('skips an entry whose former paths hold more than one clone', async () => {
    const origins = { alpha: 'git@github.com:owner/alpha.git', old: 'git@github.com:owner/alpha.git' };
    const { result } = await run(['apply-moves'], {
      clones: { alpha: buildClone({}), old: buildClone({}) },
      origins,
      registry: MOVED,
    });
    expect(result.stderr).toContain(
      'thor-repo: alpha: more than one former path holds its clone: ~/repos/alpha, ~/repos/old; skipped',
    );
    expect(result.status).toBe(1);
  });

  it('skips an entry whose path another entry also names', async () => {
    const { result } = await run(['apply-moves'], {
      clones: { alpha: buildClone({}) },
      origins: { alpha: 'git@github.com:owner/alpha.git' },
      registry: `${MOVED}  - name: kit\n    path: ~/repos/kit\n`,
    });
    expect(result.stderr).toBe(
      'thor-repo: alpha: its path, ~/repos/kit, is also the path of kit; skipped\nthor-repo: nothing to move',
    );
    expect(result.status).toBe(1);
  });

  it('ignores a former path whose clone has another origin, and reports nothing to move', async () => {
    const { registryText, result } = await run(['apply-moves'], {
      clones: { alpha: buildClone({}) },
      origins: { alpha: 'git@github.com:owner/other.git' },
      registry: MOVED,
    });
    expect(result.stderr).toBe(
      'thor-repo: alpha: ignored ~/repos/alpha, which is not its clone\nthor-repo: nothing to move',
    );
    expect(result.status).toBe(0);
    expect(registryText).toBe(MOVED);
  });
});

// region | Helpers

/** Runs a verb against a fixture registry, returning the captured run and the registry's text afterward. */
async function run(
  args: string[],
  setup: {
    branch?: string;
    clones?: Record<string, FakeClone>;
    origins?: Record<string, string>;
    registry?: string;
  } = {},
): Promise<{ registryText: string; result: CapturedRun }> {
  using tree = createTempTree({ 'repos.yaml': setup.registry ?? REGISTRY }, { prefix: 'repo-tools-' });
  const file = tree.resolve('repos.yaml');
  const adapters = buildFakeAdapters(setup.clones ?? CLONES, setup.origins, setup.branch);
  const result = await runCaptured([...args.slice(0, 1), '--file', file, ...args.slice(1)], {
    adapters,
    env: { HOME: FAKE_HOME },
  });
  return { registryText: fs.readFileSync(file, 'utf8'), result };
}

// endregion | Helpers
