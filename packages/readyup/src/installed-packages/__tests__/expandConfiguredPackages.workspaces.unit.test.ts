import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, test } from 'vitest';

import { expandConfiguredPackages } from '../expandConfiguredPackages.ts';

const it = test.extend(
  'temp',
  // A tree per test: workspace discovery holds its answer for the life of the process, keyed by directory.
  makeFixture(() => createTempTree({}, { prefix: 'expand-packages-workspaces-' })),
);

describe(`${expandConfiguredPackages.name} workspace fallback`, () => {
  it('expands a workspace the project declares no dependency on', ({ temp }) => {
    temp.writeJson('package.json', { name: 'root', private: true, workspaces: ['packages/*'] });
    writeKitPackage(temp, 'packages/kit-workspace', { name: 'kit-workspace', version: '3.0.0' }, 'default');

    expect(expandConfiguredPackages(['kit-workspace'], '.js', temp.dir)).toStrictEqual([
      {
        packageName: 'kit-workspace',
        version: '3.0.0',
        kitName: 'default',
        description: undefined,
        path: temp.resolve('packages/kit-workspace/.readyup/kits/default.js'),
      },
    ]);
  });

  it('expands a private workspace, which publication to a registry is what `private` withholds', ({ temp }) => {
    temp.writeJson('package.json', { name: 'root', private: true, workspaces: ['packages/*'] });
    writeKitPackage(temp, 'packages/sealed', { name: 'sealed', private: true, version: '1.2.0' }, 'default');

    expect(expandConfiguredPackages(['sealed'], '.js', temp.dir).map((kit) => kit.version)).toStrictEqual(['1.2.0']);
  });

  it('prefers the installed copy where a package is both installed and a workspace', ({ temp }) => {
    temp.writeJson('package.json', { name: 'root', private: true, workspaces: ['packages/*'] });
    writeKitPackage(temp, 'packages/dual', { name: 'dual', version: '9.9.9' }, 'default');
    writeKitPackage(temp, 'node_modules/dual', { name: 'dual', version: '1.0.0' }, 'default');

    expect(expandConfiguredPackages(['dual'], '.js', temp.dir)).toStrictEqual([
      {
        packageName: 'dual',
        version: '1.0.0',
        kitName: 'default',
        description: undefined,
        path: temp.resolve('node_modules/dual/.readyup/kits/default.js'),
      },
    ]);
  });

  // This suite runs in a repo whose own workspaces include `readyup`, so an answer read through the
  // ambient cwd would resolve the name the directory under test does not hold.
  it('reads the workspaces of the directory it is handed, not those of the ambient cwd', ({ temp }) => {
    temp.writeJson('package.json', { name: 'root', private: true, workspaces: ['packages/*'] });
    writeKitPackage(temp, 'packages/other', { name: 'other', version: '1.0.0' }, 'default');

    expect(() => expandConfiguredPackages(['readyup'], '.js', temp.dir)).toThrow(
      /Configured package "readyup" was not found/,
    );
  });

  it('names the configured package where the project has no manifest to discover workspaces from', ({ temp }) => {
    expect(() => expandConfiguredPackages(['kit-workspace'], '.js', temp.dir)).toThrow(
      /Configured package "kit-workspace" was not found/,
    );
  });

  it('names the configured package where the workspace globs cannot be expanded', ({ temp }) => {
    temp.writeJson('package.json', {
      name: 'root',
      private: true,
      workspaces: ['packages/*', '!packages/deprecated/*'],
    });
    writeKitPackage(temp, 'packages/kit-workspace', { name: 'kit-workspace', version: '3.0.0' }, 'default');

    expect(() => expandConfiguredPackages(['kit-workspace'], '.js', temp.dir)).toThrow(
      /Configured package "kit-workspace" was not found/,
    );
  });
});

// region | Helpers

/** Writes a package manifest and one compiled kit beside it, at a root-relative directory. */
function writeKitPackage(temp: TempTree, relDir: string, packageJson: Record<string, unknown>, kitName: string): void {
  temp.writeJson(`${relDir}/package.json`, packageJson);
  temp.write(`${relDir}/.readyup/kits/${kitName}.js`, 'export default {};\n');
}

// endregion | Helpers
