import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { expandConfiguredPackages } from '../../src/packages/expandConfiguredPackages.ts';

let projectRoot: string;

describe(expandConfiguredPackages, () => {
  beforeAll(() => {
    projectRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'expand-packages-')));

    installPackage('@acme/kits', '2.1.0', {
      kits: ['drift', 'preflight'],
      manifest: JSON.stringify({ version: 1, kits: [{ name: 'drift' }, { name: 'preflight' }] }),
    });
    installPackage('plain-kit', '0.4.0', { kits: ['smoke'] });
    installPackage('kitless', '1.0.0');
    installPackage('broken-manifest', '1.0.0', { kits: ['drift'], manifest: '{ not json' });
  });

  afterAll(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('expands a scoped package into the kits its manifest declares', () => {
    expect(expandConfiguredPackages(['@acme/kits'], '.js', projectRoot)).toStrictEqual([
      {
        packageName: '@acme/kits',
        version: '2.1.0',
        kitName: 'drift',
        path: path.join(projectRoot, 'node_modules', '@acme/kits', '.readyup', 'kits', 'drift.js'),
      },
      {
        packageName: '@acme/kits',
        version: '2.1.0',
        kitName: 'preflight',
        path: path.join(projectRoot, 'node_modules', '@acme/kits', '.readyup', 'kits', 'preflight.js'),
      },
    ]);
  });

  // The same precedence a local `--from` source follows, so a package and a directory answer alike.
  it('falls back to the kit directory when a package ships no manifest', () => {
    const [kit] = expandConfiguredPackages(['plain-kit'], '.js', projectRoot);

    expect(kit?.kitName).toBe('smoke');
    expect(kit?.version).toBe('0.4.0');
  });

  it('expands every configured package, in configured order', () => {
    const kits = expandConfiguredPackages(['plain-kit', '@acme/kits'], '.js', projectRoot);

    expect(kits.map((kit) => `${kit.packageName}:${kit.kitName}`)).toStrictEqual([
      'plain-kit:smoke',
      '@acme/kits:drift',
      '@acme/kits:preflight',
    ]);
  });

  it('names the package when it is not installed', () => {
    expect(() => expandConfiguredPackages(['absent-package'], '.js', projectRoot)).toThrow(
      /Configured package "absent-package" is not installed/,
    );
  });

  it('names the package when it publishes no kits', () => {
    expect(() => expandConfiguredPackages(['kitless'], '.js', projectRoot)).toThrow(
      /Configured package "kitless" publishes no kits/,
    );
  });

  // Falling back here would report a kit list the publisher never declared.
  it('surfaces a malformed manifest instead of reading around it', () => {
    expect(() => expandConfiguredPackages(['broken-manifest'], '.js', projectRoot)).toThrow(/invalid JSON/);
  });
});

// region | Helpers

/** Installs a package into the fixture project, with the kit files and manifest it publishes. */
function installPackage(
  name: string,
  version: string,
  options: { kits?: string[]; manifest?: string | undefined } = {},
): void {
  const root = path.join(projectRoot, 'node_modules', name);
  mkdirSync(path.join(root, '.readyup', 'kits'), { recursive: true });
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name, version }));

  for (const kit of options.kits ?? []) {
    writeFileSync(path.join(root, '.readyup', 'kits', `${kit}.js`), 'export default {};\n');
  }
  if (options.manifest !== undefined) {
    writeFileSync(path.join(root, '.readyup', 'manifest.json'), options.manifest);
  }
}

// endregion | Helpers
