import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTempDir } from '../../test-utils/tempDir.ts';
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

const temp = useTempDir({ prefix: 'rdy-ws-cache-', cwd: 'mock' });

describe(`${discoverWorkspaces.name} memoization`, () => {
  beforeEach(() => {
    readDirectories.length = 0;
  });

  it('walks once across calls passing different filters, and filters each result correctly', () => {
    writeMonorepo();

    const packages = discoverWorkspaces({ filter: (workspace) => workspace.isPackage });
    const walkedForFirstCall = readDirectories.length;
    const privateWorkspaces = discoverWorkspaces({ filter: (workspace) => !workspace.isPackage });

    expect(packages.map((workspace) => workspace.name)).toStrictEqual(['alpha']);
    expect(privateWorkspaces.map((workspace) => workspace.name)).toStrictEqual(['internal']);
    // Guards the equality below, which two zeroes would also satisfy.
    expect(walkedForFirstCall).toBeGreaterThan(0);
    expect(readDirectories).toHaveLength(walkedForFirstCall);
  });

  it('walks again for a second cwd', () => {
    writeMonorepo();
    discoverWorkspaces();
    const walkedForFirstRoot = readDirectories.length;

    const secondRoot = temp.mkdir('second-root');
    temp.writeJson('second-root/package.json', { name: 'second', private: true, workspaces: ['packages/*'] });
    temp.writeJson('second-root/packages/solo/package.json', { name: 'solo' });
    vi.spyOn(process, 'cwd').mockReturnValue(secondRoot);

    const workspaces = discoverWorkspaces();

    expect(workspaces.map((workspace) => workspace.name)).toStrictEqual(['solo']);
    expect(readDirectories.length).toBeGreaterThan(walkedForFirstRoot);
  });

  it('answers a later call in full after a caller empties the array it returned', () => {
    writeMonorepo();

    discoverWorkspaces().length = 0;

    expect(discoverWorkspaces().map((workspace) => workspace.dir)).toStrictEqual([
      'packages/alpha',
      'packages/internal',
    ]);
  });

  it('caches nothing when discovery throws, so a repaired repo is discovered on the next call', () => {
    expect(() => discoverWorkspaces()).toThrow(/no package\.json found at/);
    expect(() => discoverWorkspaces()).toThrow(/no package\.json found at/);

    temp.writeJson('package.json', { name: 'solo' });

    expect(discoverWorkspaces().map((workspace) => workspace.name)).toStrictEqual(['solo']);
  });
});

// region | Helpers

/** Writes a two-workspace monorepo whose members differ in `private`, so a filter can tell them apart. */
function writeMonorepo(): void {
  temp.writeJson('package.json', { name: 'root', private: true, workspaces: ['packages/*'] });
  temp.writeJson(join('packages/alpha', 'package.json'), { name: 'alpha' });
  temp.writeJson(join('packages/internal', 'package.json'), { name: 'internal', private: true });
}

// endregion | Helpers
