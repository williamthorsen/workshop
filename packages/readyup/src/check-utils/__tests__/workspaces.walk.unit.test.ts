import { join } from 'node:path';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { discoverWorkspaces } from '../workspaces.ts';

// Hoisted alongside the `vi.mock` factory below, which runs before this module's own bindings initialize.
const { failures } = vi.hoisted(() => {
  const failures = new Map<string, string>();
  return { failures };
});

// The module under test binds `readdirSync` at import, so a spy on the `node:fs` namespace never reaches it.
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

const it = test.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'rdy-ws-walk-' })),
);

it.aroundEach(async (runTest, { temp }) => {
  using _cwd = pointCwdAt(temp.dir);

  await runTest();
});

beforeEach(() => {
  failures.clear();
});

describe(`${discoverWorkspaces.name} directory walk`, () => {
  it('reads every readable directory when none fails', ({ temp }) => {
    writeMonorepo(temp);

    expect(discoverWorkspaces().map((workspace) => workspace.name)).toStrictEqual(['alpha', 'locked', 'inner']);
  });

  it('skips the subtree under a directory it cannot read for a benign reason, keeping the rest', ({ temp }) => {
    writeMonorepo(temp);
    failures.set(join(temp.dir, 'packages/locked'), 'EACCES');

    expect(discoverWorkspaces().map((workspace) => workspace.name)).toStrictEqual(['alpha', 'locked']);
  });

  it('propagates a systemic read failure rather than answering with a partial walk', ({ temp }) => {
    writeMonorepo(temp);
    failures.set(join(temp.dir, 'packages/locked'), 'EMFILE');

    expect(() => discoverWorkspaces()).toThrow(/EMFILE/);
  });
});

// region | Helpers

/**
 * Writes a monorepo whose `packages/locked` holds a nested workspace, so a failed read of `locked`
 * costs `inner` and nothing else. `locked` itself is matched from reading `packages/`, so it survives.
 */
function writeMonorepo(temp: TempTree): void {
  temp.writeJson('package.json', { name: 'root', private: true, workspaces: ['packages/**'] });
  temp.writeJson(join('packages/alpha', 'package.json'), { name: 'alpha' });
  temp.writeJson(join('packages/locked', 'package.json'), { name: 'locked' });
  temp.writeJson(join('packages/locked/inner', 'package.json'), { name: 'inner' });
}

// endregion | Helpers
