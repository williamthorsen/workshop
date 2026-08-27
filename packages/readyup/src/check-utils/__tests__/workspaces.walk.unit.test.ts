import { join } from 'node:path';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { beforeEach, describe, expect, it as baseIt, vi } from 'vitest';

import { discoverWorkspaces } from '../workspaces.ts';

// Hoisted alongside the `vi.mock` factory below, which runs before this module's own bindings initialize.
const { failures } = vi.hoisted(() => {
  const failures = new Map<string, string>();
  return { failures };
});

// `walkDirectories` binds `readdirSync` at import, so a spy on the `node:fs` namespace never reaches it.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readdirSync: (...args: Parameters<typeof actual.readdirSync>) => {
      const code = failures.get(String(args[0]));
      if (code !== undefined) throw Object.assign(new Error(`${code}: simulated`), { code });
      return actual.readdirSync(...args);
    },
  };
});

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'rdy-ws-walk-' })),
);

it.aroundEach(async (runTest, { temp }) => {
  using _cwd = pointCwdAt(temp.dir);

  await runTest();
});

describe(`${discoverWorkspaces.name} directory walk`, () => {
  beforeEach(() => {
    failures.clear();
  });

  it('reads every readable directory when none fails', ({ temp }) => {
    writeMonorepo(temp);

    expect(discoverWorkspaces().map((workspace) => workspace.name)).toStrictEqual(['root', 'alpha', 'locked', 'inner']);
  });

  it('drops a directory it cannot read for a benign reason along with its subtree, keeping the rest', ({ temp }) => {
    writeMonorepo(temp);
    failures.set(join(temp.dir, 'packages/locked'), 'EACCES');

    expect(discoverWorkspaces().map((workspace) => workspace.name)).toStrictEqual(['root', 'alpha']);
  });

  it('propagates a systemic read failure rather than answering with a partial walk', ({ temp }) => {
    writeMonorepo(temp);
    failures.set(join(temp.dir, 'packages/locked'), 'EMFILE');

    expect(() => discoverWorkspaces()).toThrow(/EMFILE/);
  });
});

// region | Helpers

/**
 * Writes a monorepo whose `packages/locked` holds a nested workspace, so a failed read of `locked` costs
 * both while `alpha` survives. A directory qualifies as a workspace only when reading it reveals a
 * `package.json`, and that is the read that fails.
 */
function writeMonorepo(temp: TempTree): void {
  temp.writeJson('package.json', { name: 'root', private: true, workspaces: ['packages/**'] });
  temp.writeJson(join('packages/alpha', 'package.json'), { name: 'alpha' });
  temp.writeJson(join('packages/locked', 'package.json'), { name: 'locked' });
  temp.writeJson(join('packages/locked/inner', 'package.json'), { name: 'inner' });
}

// endregion | Helpers
