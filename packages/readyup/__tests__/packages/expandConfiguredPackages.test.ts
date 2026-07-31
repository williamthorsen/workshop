import path from 'node:path';

import { describe, expect } from 'vitest';

import { expandConfiguredPackages } from '../../src/packages/expandConfiguredPackages.ts';
import { createTempDirTest, type TempDir } from '../helpers/tempDir.ts';

const it = createTempDirTest({
  prefix: 'expand-packages-',
  scope: 'file',
  setup: (temp) => {
    installPackage(temp, '@acme/kits', '2.1.0', {
      kits: ['drift', 'preflight'],
      manifest: JSON.stringify({ version: 1, kits: [{ name: 'drift' }, { name: 'preflight' }] }),
    });
    installPackage(temp, 'plain-kit', '0.4.0', { kits: ['smoke'] });
    installPackage(temp, 'kitless', '1.0.0');
    installPackage(temp, 'broken-manifest', '1.0.0', { kits: ['drift'], manifest: '{ not json' });
  },
});

describe(expandConfiguredPackages, () => {
  it('expands a scoped package into the kits its manifest declares', ({ temp }) => {
    expect(expandConfiguredPackages(['@acme/kits'], '.js', temp.dir)).toStrictEqual([
      {
        packageName: '@acme/kits',
        version: '2.1.0',
        kitName: 'drift',
        path: path.join(temp.dir, 'node_modules', '@acme/kits', '.readyup', 'kits', 'drift.js'),
      },
      {
        packageName: '@acme/kits',
        version: '2.1.0',
        kitName: 'preflight',
        path: path.join(temp.dir, 'node_modules', '@acme/kits', '.readyup', 'kits', 'preflight.js'),
      },
    ]);
  });

  // The same precedence a local `--from` source follows, so a package and a directory answer alike.
  it('falls back to the kit directory when a package ships no manifest', ({ temp }) => {
    const [kit] = expandConfiguredPackages(['plain-kit'], '.js', temp.dir);

    expect(kit?.kitName).toBe('smoke');
    expect(kit?.version).toBe('0.4.0');
  });

  it('expands every configured package, in configured order', ({ temp }) => {
    const kits = expandConfiguredPackages(['plain-kit', '@acme/kits'], '.js', temp.dir);

    expect(kits.map((kit) => `${kit.packageName}:${kit.kitName}`)).toStrictEqual([
      'plain-kit:smoke',
      '@acme/kits:drift',
      '@acme/kits:preflight',
    ]);
  });

  it('names the package when it is not installed', ({ temp }) => {
    expect(() => expandConfiguredPackages(['absent-package'], '.js', temp.dir)).toThrow(
      /Configured package "absent-package" is not installed/,
    );
  });

  it('names the package when it publishes no kits', ({ temp }) => {
    expect(() => expandConfiguredPackages(['kitless'], '.js', temp.dir)).toThrow(
      /Configured package "kitless" publishes no kits/,
    );
  });

  // Falling back here would report a kit list the publisher never declared.
  it('surfaces a malformed manifest instead of reading around it', ({ temp }) => {
    expect(() => expandConfiguredPackages(['broken-manifest'], '.js', temp.dir)).toThrow(/invalid JSON/);
  });
});

// region | Helpers

/** Installs a package into the fixture project, with the kit files and manifest it publishes. */
function installPackage(
  temp: TempDir,
  name: string,
  version: string,
  options: { kits?: string[]; manifest?: string | undefined } = {},
): void {
  const root = path.join('node_modules', name);
  temp.mkdir(path.join(root, '.readyup', 'kits'));
  temp.writeJson(path.join(root, 'package.json'), { name, version });

  for (const kit of options.kits ?? []) {
    temp.write(path.join(root, '.readyup', 'kits', `${kit}.js`), 'export default {};\n');
  }
  if (options.manifest !== undefined) {
    temp.write(path.join(root, '.readyup', 'manifest.json'), options.manifest);
  }
}

// endregion | Helpers
