import { join } from 'node:path';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { beforeEach, describe, expect, it as baseIt, vi } from 'vitest';

import { discoverWorkspaces } from '../workspaces.ts';

// Hoisted alongside the `vi.mock` factory below, which runs before this module's own bindings initialize.
const { readDirectories } = vi.hoisted(() => {
  const readDirectories: string[] = [];
  return { readDirectories };
});

// The module under test binds `readdirSync` at import, so a spy on the `node:fs` namespace never reaches it.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readdirSync: (...args: Parameters<typeof actual.readdirSync>) => {
      readDirectories.push(String(args[0]));
      return actual.readdirSync(...args);
    },
  };
});

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'rdy-ws-cache-' })),
);

it.aroundEach(async (runTest, { temp }) => {
  using _cwd = pointCwdAt(temp.dir);

  await runTest();
});

describe(`${discoverWorkspaces.name} memoization`, () => {
  beforeEach(() => {
    readDirectories.length = 0;
  });

  it('walks once across calls passing different filters, and filters each result correctly', ({ temp }) => {
    writeMonorepo(temp);

    const packages = discoverWorkspaces({ filter: (workspace) => workspace.isPackage });
    const walkedForFirstCall = readDirectories.length;
    const privateWorkspaces = discoverWorkspaces({ filter: (workspace) => !workspace.isPackage });

    expect(packages.map((workspace) => workspace.name)).toStrictEqual(['alpha']);
    expect(privateWorkspaces.map((workspace) => workspace.name)).toStrictEqual(['root', 'internal']);
    // Guards the equality below, which two zeroes would also satisfy.
    expect(walkedForFirstCall).toBeGreaterThan(0);
    expect(readDirectories).toHaveLength(walkedForFirstCall);
  });

  it('walks again for a second cwd', ({ temp }) => {
    writeMonorepo(temp);
    discoverWorkspaces();
    const walkedForFirstRoot = readDirectories.length;

    const secondRoot = temp.mkdir('second-root');
    temp.writeJson('second-root/package.json', { name: 'second', private: true, workspaces: ['packages/*'] });
    temp.writeJson('second-root/packages/solo/package.json', { name: 'solo' });
    using _cwd = pointCwdAt(secondRoot);

    const workspaces = discoverWorkspaces();

    expect(workspaces.map((workspace) => workspace.name)).toStrictEqual(['second', 'solo']);
    expect(readDirectories.length).toBeGreaterThan(walkedForFirstRoot);
  });

  it('returns a full array to a later call after a caller empties the one it returned', ({ temp }) => {
    writeMonorepo(temp);

    discoverWorkspaces().length = 0;

    expect(discoverWorkspaces().map((workspace) => workspace.dir)).toStrictEqual([
      '.',
      'packages/alpha',
      'packages/internal',
    ]);
  });

  it('caches nothing when discovery throws, so a repaired repo is discovered on the next call', ({ temp }) => {
    expect(() => discoverWorkspaces()).toThrow(/no readable package\.json at/);
    expect(() => discoverWorkspaces()).toThrow(/no readable package\.json at/);

    temp.writeJson('package.json', { name: 'solo' });

    expect(discoverWorkspaces().map((workspace) => workspace.name)).toStrictEqual(['solo']);
  });
});

// region | Helpers

/** Writes a monorepo with two member packages that differ in `private`, so a filter can tell them apart. */
function writeMonorepo(temp: TempTree): void {
  temp.writeJson('package.json', { name: 'root', private: true, workspaces: ['packages/*'] });
  temp.writeJson(join('packages/alpha', 'package.json'), { name: 'alpha' });
  temp.writeJson(join('packages/internal', 'package.json'), { name: 'internal', private: true });
}

// endregion | Helpers
