import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { discoverKitPackages } from '../../src/packages/discoverKitPackages.ts';

let projectRoot: string;
let manifestlessRoot: string;

describe(discoverKitPackages, () => {
  beforeAll(() => {
    projectRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'discover-packages-')));
    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify({
        name: 'consumer',
        dependencies: { 'zebra-kit': '1.0.0' },
        devDependencies: { '@acme/kits': '1.0.0', kitless: '1.0.0' },
      }),
    );

    installPackage(projectRoot, 'zebra-kit', ['smoke']);
    installPackage(projectRoot, '@acme/kits', ['drift']);
    installPackage(projectRoot, 'kitless', []);
    // Installed and publishing kits, but never declared as a dependency.
    installPackage(projectRoot, 'undeclared-kit', ['drift']);

    manifestlessRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'discover-no-manifest-')));
  });

  afterAll(() => {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(manifestlessRoot, { recursive: true, force: true });
  });

  it('names declared dependencies that publish kits, sorted, across both dependency fields', () => {
    expect(discoverKitPackages(projectRoot)).toStrictEqual(['@acme/kits', 'zebra-kit']);
  });

  it('omits a declared dependency that publishes no kits', () => {
    expect(discoverKitPackages(projectRoot)).not.toContain('kitless');
  });

  // Suggesting a package the reader never chose to depend on is not something they can act on.
  it('omits an installed package that is not a declared dependency', () => {
    expect(discoverKitPackages(projectRoot)).not.toContain('undeclared-kit');
  });

  it('answers with nothing when the project manifest cannot be read', () => {
    expect(discoverKitPackages(manifestlessRoot)).toStrictEqual([]);
  });
});

// region | Helpers

/** Installs a package into a fixture project, optionally publishing kits. */
function installPackage(root: string, name: string, kits: string[]): void {
  const packageRoot = path.join(root, 'node_modules', name);
  mkdirSync(path.join(packageRoot, '.readyup', 'kits'), { recursive: true });
  writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ name, version: '1.0.0' }));
  for (const kit of kits) {
    writeFileSync(path.join(packageRoot, '.readyup', 'kits', `${kit}.js`), 'export default {};\n');
  }
}

// endregion | Helpers
