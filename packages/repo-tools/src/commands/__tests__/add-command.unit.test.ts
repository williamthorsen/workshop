import { describe, expect, it } from 'vitest';

import { buildClone, FAKE_HOME } from '../test-utils/fake-clones.ts';
import { CURRENT_CLONES, CURRENT_GITHUB, facts, REGISTRY } from '../test-utils/registry-fixtures.ts';
import { buildRegistryRunner } from '../test-utils/registry-runner.ts';

const run = buildRegistryRunner({ clones: CURRENT_CLONES, github: CURRENT_GITHUB, registry: REGISTRY });

describe('add', () => {
  it('prints the entry for a clone that the registry lacks, without writing it', async () => {
    const clones = { delta: buildClone({ 'package.json': { vue: '3' } }) };
    const { registryText, result } = await run(['add', '~/repos/delta'], {
      clones,
      origins: { delta: 'git@github.com:owner/delta.git' },
    });
    expect(result.stdout).toBe('  - name: delta\n    path: ~/repos/delta\n    repo: owner/delta\n    stack: [vue]');
    expect(result.stderr).toContain(
      'thor-repo: owner/delta: cannot read GitHub: no such repo; the entry omits visibility and runner',
    );
    expect(result.stderr).toContain('thor-repo: nothing written; pass --write');
    expect(registryText).toBe(REGISTRY);
    expect(result.status).toBe(0);
  });

  it('appends the entry under --write with its GitHub fields, reading an HTTPS origin', async () => {
    const clones = { delta: buildClone({}) };
    const origins = { delta: 'https://github.com/owner/delta' };
    const github = { 'owner/delta': facts('private', 'imac2') };
    const { registryText, result } = await run(['add', `${FAKE_HOME}/repos/delta`, '--write'], {
      clones,
      github,
      origins,
    });
    expect(result.status).toBe(0);
    expect(registryText).toBe(
      `${REGISTRY}  - name: delta\n    path: ~/repos/delta\n    repo: owner/delta\n    visibility: private\n    runner: imac2\n`,
    );
  });

  it('omits runner when CI_RUNS_ON is unsupported', async () => {
    const github = {
      'owner/delta': { runner: undefined, runnerProblem: 'is empty', visibility: 'public' as const },
    };
    const { result } = await run(['add', '~/repos/delta'], {
      clones: { delta: buildClone({}) },
      github,
      origins: { delta: 'git@github.com:owner/delta.git' },
    });
    expect(result.stdout).toBe(
      '  - name: delta\n    path: ~/repos/delta\n    repo: owner/delta\n    visibility: public',
    );
    expect(result.stderr).toContain('thor-repo: owner/delta: CI_RUNS_ON is empty; the entry omits runner');
  });

  it('omits the GitHub fields for an origin hosted elsewhere, appending the entry under --write', async () => {
    // The reader knows the path, so a GitHub read would add `visibility` to the entry.
    const github = { 'ws/wthorsen-demos': facts('private') };
    const { registryText, result } = await run(['add', '~/repos/demos', '--write'], {
      clones: { demos: buildClone({}) },
      github,
      origins: { demos: 'https://u@bitbucket.org/ws/wthorsen-demos.git' },
    });
    expect(result.stdout).toBe('  - name: wthorsen-demos\n    path: ~/repos/demos');
    expect(result.stderr).toContain(
      `thor-repo: ${FAKE_HOME}/repos/demos: origin host bitbucket.org is not github.com; the entry omits repo, visibility, and runner`,
    );
    expect(result.stderr).not.toContain('GitHub');
    expect(registryText).toBe(`${REGISTRY}  - name: wthorsen-demos\n    path: ~/repos/demos\n`);
    expect(result.status).toBe(0);
  });

  it('does not match a new clone hosted elsewhere to an entry that also lacks repo', async () => {
    const registry = `${REGISTRY}  - name: epsilon\n    path: ~/repos/epsilon\n`;
    const { result } = await run(['add', '~/repos/demos'], {
      clones: { demos: buildClone({}) },
      origins: { demos: 'git@bitbucket.org:ws/demos.git' },
      registry,
    });
    expect(result.stdout).toBe('  - name: demos\n    path: ~/repos/demos');
    expect(result.status).toBe(0);
  });

  it('refuses a clone hosted elsewhere that is registered without repo, matching its path', async () => {
    const registry = `${REGISTRY}  - name: demos\n    path: ~/repos/demos\n`;
    const { result } = await run(['add', '~/repos/demos'], {
      clones: { demos: buildClone({}) },
      origins: { demos: 'git@bitbucket.org:ws/wthorsen-demos.git' },
      registry,
    });
    expect(result.stderr).toContain('already registered as demos');
    expect(result.status).toBe(1);
  });

  it('reports why the tracked files of a clone cannot be listed', async () => {
    const { registryText, result } = await run(['add', '~/repos/delta', '--write'], {
      clones: { delta: { files: {}, tracked: 'git ls-files was killed by SIGKILL' } },
      origins: { delta: 'git@github.com:owner/delta.git' },
    });
    expect(result.stderr).toBe(
      `thor-repo: cannot list the tracked files of ${FAKE_HOME}/repos/delta: git ls-files was killed by SIGKILL`,
    );
    expect(registryText).toBe(REGISTRY);
    expect(result.status).toBe(1);
  });

  it.each([
    [
      'a registered clone',
      ['add', '~/repos/alpha'],
      { alpha: 'git@github.com:owner/alpha.git' },
      'already registered as alpha',
    ],
    ['a path outside any clone', ['add', '~/elsewhere'], {}, 'is not in a git clone'],
    ['a clone without an origin remote', ['add', '~/repos/delta'], {}, 'has no origin remote'],
  ])('refuses %s', async (_, args, origins, message) => {
    const clones = { alpha: CURRENT_CLONES.alpha, delta: buildClone({}) };
    const { result } = await run(args, { clones, origins });
    expect(result.stderr).toContain(message);
    expect(result.status).toBe(1);
  });
});
