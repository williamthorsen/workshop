import { join } from 'node:path';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it, test } from 'vitest';

import { discoverWorkspaces } from '../../check-utils/workspaces.ts';
import { makeWorkspace } from '../makeWorkspace.ts';

describe(makeWorkspace, () => {
  it('fills every field when given no overrides', () => {
    expect(makeWorkspace()).toStrictEqual({
      dir: 'packages/example',
      absolutePath: '/repo/packages/example',
      name: 'example',
      isPackage: true,
      isRoot: false,
      packageJson: { name: 'example' },
    });
  });

  it('derives the root fields from a `.` directory', () => {
    expect(makeWorkspace({ dir: '.' })).toMatchObject({
      absolutePath: '/repo',
      name: 'repo',
      isRoot: true,
    });
  });

  it('derives `name` and `isPackage` from the manifest', () => {
    const workspace = makeWorkspace({ packageJson: { name: '@scope/alpha', private: true } });

    expect(workspace.name).toBe('@scope/alpha');
    expect(workspace.isPackage).toBe(false);
  });

  it('lets an override win over the derivation', () => {
    expect(makeWorkspace({ dir: '.', isRoot: false }).isRoot).toBe(false);
    expect(makeWorkspace({ packageJson: { private: true }, isPackage: true }).isPackage).toBe(true);
  });

  it('freezes the workspace and its manifest', () => {
    const workspace = makeWorkspace();

    expect(() => Object.assign(workspace, { dir: 'elsewhere' })).toThrow(TypeError);
    expect(() => Object.assign(workspace.packageJson, { name: 'elsewhere' })).toThrow(TypeError);
  });

  it('copies the manifest it is given, leaving the object the caller passed writable', () => {
    const shared: Record<string, unknown> = { name: 'alpha' };

    makeWorkspace({ packageJson: shared });

    expect(() => Object.assign(shared, { version: '1.0.0' })).not.toThrow();
  });
});

describe('fidelity to discovery', () => {
  const itInTree = test.extend(
    'temp',
    makeFixture(() => createTempTree({}, { prefix: 'rdy-fixture-' })),
  );

  itInTree.aroundEach(async (runTest, { temp }) => {
    using _cwd = pointCwdAt(temp.dir);

    await runTest();
  });

  // Every assertion above reads only the fields it names, so a builder drifting from the producer would still satisfy
  // them. This one compares the whole value.
  itInTree('reports what discovery reports for the same directory and manifest', ({ temp }) => {
    writeRootPackageJson(temp, { name: 'root', private: true });
    writePnpmWorkspaceYaml(temp, 'packages:\n  - packages/*\n');
    writeWorkspacePackage(temp, 'packages/alpha', { name: 'alpha', version: '1.0.0' });

    const discovered = discoverWorkspaces();

    expect(discovered.map((workspace) => workspace.dir)).toStrictEqual(['.', 'packages/alpha']);
    for (const workspace of discovered) {
      const fixture = makeWorkspace({
        dir: workspace.dir,
        absolutePath: workspace.absolutePath,
        packageJson: workspace.packageJson,
      });

      expect(fixture).toStrictEqual(workspace);
    }
  });
});

// region | Helpers

/** Writes the pnpm workspace manifest naming the member glob. */
function writePnpmWorkspaceYaml(temp: TempTree, content: string): void {
  temp.write('pnpm-workspace.yaml', content);
}

/** Writes the root manifest. */
function writeRootPackageJson(temp: TempTree, content: Record<string, unknown>): void {
  temp.writeJson('package.json', content);
}

/** Writes a package manifest at a root-relative directory. */
function writeWorkspacePackage(temp: TempTree, relDir: string, content: Record<string, unknown>): void {
  temp.writeJson(join(relDir, 'package.json'), content);
}

// endregion | Helpers
