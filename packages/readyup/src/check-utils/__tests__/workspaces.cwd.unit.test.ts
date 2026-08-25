import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, test, vi } from 'vitest';

import { discoverWorkspaces, type Workspace } from '../workspaces.ts';

/**
 * The `node:fs` functions a repoint can be armed on: `existsSync` fires on the root manifest read,
 * discovery's first filesystem call after it snapshots the cwd, and `readdirSync` on the directory walk.
 */
type FsTrigger = 'existsSync' | 'readdirSync';

// Hoisted alongside the `vi.mock` factory below, which runs before this module's own bindings initialize.
const { repoint } = vi.hoisted(() => {
  const repoint: { on: FsTrigger | undefined; to: string } = { on: undefined, to: '' };
  return { repoint };
});

// The modules under test bind their `node:fs` functions at import, so a spy on the namespace never reaches them.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();

  function applyRepoint(fsFunction: FsTrigger): void {
    if (repoint.on !== fsFunction) return;
    repoint.on = undefined;
    const decoyDir = repoint.to;
    process.cwd = () => decoyDir;
  }

  return {
    ...actual,
    existsSync: (...args: Parameters<typeof actual.existsSync>) => {
      applyRepoint('existsSync');
      return actual.existsSync(...args);
    },
    readdirSync: (...args: Parameters<typeof actual.readdirSync>) => {
      applyRepoint('readdirSync');
      return actual.readdirSync(...args);
    },
  };
});

const it = test.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'rdy-ws-cwd-' })),
);

it.aroundEach(async (runTest, { temp }) => {
  using _cwd = pointCwdAt(temp.dir);

  await runTest();
});

// Every ordinary discovery assertion passes whether or not a helper reads through the `cwd` it was handed, because
// the snapshot and the ambient cwd are the same directory. Moving the ambient one mid-discovery separates them.
describe(`${discoverWorkspaces.name} cwd reconciliation`, () => {
  it('reads the pattern list at the directory it snapshotted', ({ temp }) => {
    temp.writeJson('package.json', { name: 'root', private: true, workspaces: ['packages/*'] });
    temp.writeJson('packages/alpha/package.json', { name: 'alpha' });
    const decoyDir = writeDecoyRoot(temp);

    const workspaces = discoverWithCwdRepointedAt(decoyDir, 'existsSync');

    expect(workspaces.map((workspace) => workspace.name)).toStrictEqual(['root', 'alpha']);
  });

  it('reads the single-workspace manifest at the directory it snapshotted', ({ temp }) => {
    temp.writeJson('package.json', { name: 'root', private: true });
    const decoyDir = writeDecoyRoot(temp);

    const workspaces = discoverWithCwdRepointedAt(decoyDir, 'existsSync');

    expect(workspaces.map((workspace) => workspace.name)).toStrictEqual(['root']);
  });

  it('reads each workspace manifest at the directory it snapshotted', ({ temp }) => {
    temp.writeJson('package.json', { name: 'root', private: true });
    temp.write('pnpm-workspace.yaml', ['packages:', '  - packages/*', ''].join('\n'));
    temp.writeJson('packages/alpha/package.json', { name: 'alpha' });
    const decoyDir = writeDecoyRoot(temp);

    const workspaces = discoverWithCwdRepointedAt(decoyDir, 'readdirSync');

    expect(workspaces.map((workspace) => workspace.name)).toStrictEqual(['root', 'alpha']);
  });
});

// region | Helpers

/**
 * Discovers workspaces with `process.cwd` repointed at `decoyDir` on the first call to `fsFunction`,
 * restoring it before the caller asserts so a failure leaves nothing behind for the next test.
 */
function discoverWithCwdRepointedAt(decoyDir: string, fsFunction: FsTrigger): Workspace[] {
  const rootDir = process.cwd();
  repoint.on = fsFunction;
  repoint.to = decoyDir;
  try {
    return discoverWorkspaces();
  } finally {
    repoint.on = undefined;
    process.cwd = () => rootDir;
  }
}

/**
 * Writes a second repo root whose manifests all use the name `decoy`, at the same relative paths as the real
 * root's, so a helper reading through the ambient cwd reports a wrong name rather than an empty result.
 */
function writeDecoyRoot(temp: TempTree): string {
  const decoyDir = temp.mkdir('decoy-root');
  temp.writeJson('decoy-root/package.json', { name: 'decoy', private: true });
  temp.writeJson('decoy-root/packages/alpha/package.json', { name: 'decoy' });
  return decoyDir;
}

// endregion | Helpers
