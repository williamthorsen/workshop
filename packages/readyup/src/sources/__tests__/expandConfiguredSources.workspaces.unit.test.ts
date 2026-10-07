import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { createUncachedRemoteContext } from '../../test-utils/createUncachedRemoteContext.ts';
import { expandConfiguredSources, type SourceKit } from '../expandConfiguredSources.ts';
import { parseConfiguredSource } from '../parseConfiguredSource.ts';

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  // A tree per test: Workspace discovery caches its result for the life of the process, keyed by directory.
  makeFixture(() => createTempTree({}, { prefix: 'expand-sources-workspaces-' })),
);

describe(`${expandConfiguredSources.name} workspace fallback`, () => {
  it('expands a workspace on which the project declares no dependency', async ({ temp }) => {
    temp.writeJson('package.json', { name: 'root', private: true, workspaces: ['packages/*'] });
    writeKitPackage(temp, 'packages/kit-workspace', { name: 'kit-workspace', version: '3.0.0' }, 'default');

    await expect(expand(['kit-workspace'], temp.dir)).resolves.toStrictEqual([
      {
        source: 'npm:kit-workspace',
        version: '3.0.0',
        kitName: 'default',
        description: undefined,
        checklists: undefined,
        location: { path: temp.resolve('packages/kit-workspace/.readyup/kits/default.js') },
        provenance: { kind: 'package', packageName: 'kit-workspace', version: '3.0.0', source: 'npm:kit-workspace' },
      },
    ]);
  });

  it('expands a private workspace, since `private` withholds publication rather than discovery', async ({ temp }) => {
    temp.writeJson('package.json', { name: 'root', private: true, workspaces: ['packages/*'] });
    writeKitPackage(temp, 'packages/sealed', { name: 'sealed', private: true, version: '1.2.0' }, 'default');

    expect((await expand(['sealed'], temp.dir)).map((kit) => kit.version)).toStrictEqual(['1.2.0']);
  });

  it('prefers the installed copy when a package is both installed and a workspace', async ({ temp }) => {
    temp.writeJson('package.json', { name: 'root', private: true, workspaces: ['packages/*'] });
    writeKitPackage(temp, 'packages/dual', { name: 'dual', version: '9.9.9' }, 'default');
    writeKitPackage(temp, 'node_modules/dual', { name: 'dual', version: '1.0.0' }, 'default');

    await expect(expand(['dual'], temp.dir)).resolves.toStrictEqual([
      {
        source: 'npm:dual',
        version: '1.0.0',
        kitName: 'default',
        description: undefined,
        checklists: undefined,
        location: { path: temp.resolve('node_modules/dual/.readyup/kits/default.js') },
        provenance: { kind: 'package', packageName: 'dual', version: '1.0.0', source: 'npm:dual' },
      },
    ]);
  });

  // This suite runs in a repo whose own workspaces include `readyup`, so a result read through the
  // ambient cwd would resolve the name that the directory under test does not contain.
  it('reads the workspaces of the directory that it is handed, not those of the ambient cwd', async ({ temp }) => {
    temp.writeJson('package.json', { name: 'root', private: true, workspaces: ['packages/*'] });
    writeKitPackage(temp, 'packages/other', { name: 'other', version: '1.0.0' }, 'default');

    await expect(expand(['readyup'], temp.dir)).rejects.toThrow(/Configured source "npm:readyup" was not found/);
  });

  it('names the configured source when the project has no manifest to discover workspaces from', async ({ temp }) => {
    await expect(expand(['kit-workspace'], temp.dir)).rejects.toThrow(
      /Configured source "npm:kit-workspace" was not found/,
    );
  });

  it('names the configured source when the workspace globs cannot be expanded', async ({ temp }) => {
    temp.writeJson('package.json', {
      name: 'root',
      private: true,
      workspaces: ['packages/*', '!packages/deprecated/*'],
    });
    writeKitPackage(temp, 'packages/kit-workspace', { name: 'kit-workspace', version: '3.0.0' }, 'default');

    await expect(expand(['kit-workspace'], temp.dir)).rejects.toThrow(
      /Configured source "npm:kit-workspace" was not found/,
    );
  });
});

// region | Helpers

/** Expands installed packages, each named as a config's `npm:` source names it. */
async function expand(names: string[], fromDir: string): Promise<SourceKit[]> {
  const sources = names.map((name) => parseConfiguredSource(`npm:${name}`));
  return expandConfiguredSources(sources, '.js', createUncachedRemoteContext(), fromDir);
}

/** Writes a package manifest and one compiled kit beside it, at a root-relative directory. */
function writeKitPackage(temp: TempTree, relDir: string, packageJson: Record<string, unknown>, kitName: string): void {
  temp.writeJson(`${relDir}/package.json`, packageJson);
  temp.write(`${relDir}/.readyup/kits/${kitName}.js`, 'export default {};\n');
}

// endregion | Helpers
