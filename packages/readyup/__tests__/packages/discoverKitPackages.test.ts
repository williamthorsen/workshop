import path from 'node:path';

import { describe, expect } from 'vitest';

import { discoverKitPackages } from '../../src/packages/discoverKitPackages.ts';
import { createTempDirFixture, createTempDirTest, type TempDir } from '../helpers/tempDir.ts';

const it = createTempDirTest({
  prefix: 'discover-packages-',
  scope: 'file',
  setup: (temp) => {
    temp.writeJson('package.json', {
      name: 'consumer',
      dependencies: { 'zebra-kit': '1.0.0' },
      devDependencies: { '@acme/kits': '1.0.0', kitless: '1.0.0' },
    });

    installPackage(temp, 'zebra-kit', ['smoke']);
    installPackage(temp, '@acme/kits', ['drift']);
    installPackage(temp, 'kitless', []);
    // Installed and publishing kits, but never declared as a dependency.
    installPackage(temp, 'undeclared-kit', ['drift']);
  },
}).extend<{ manifestless: TempDir }>({
  manifestless: createTempDirFixture({ prefix: 'discover-no-manifest-', scope: 'file' }),
});

describe(discoverKitPackages, () => {
  it('names declared dependencies that publish kits, sorted, across both dependency fields', ({ temp }) => {
    expect(discoverKitPackages(temp.dir)).toStrictEqual(['@acme/kits', 'zebra-kit']);
  });

  it('omits a declared dependency that publishes no kits', ({ temp }) => {
    expect(discoverKitPackages(temp.dir)).not.toContain('kitless');
  });

  // Suggesting a package the reader never chose to depend on is not something they can act on.
  it('omits an installed package that is not a declared dependency', ({ temp }) => {
    expect(discoverKitPackages(temp.dir)).not.toContain('undeclared-kit');
  });

  it('answers with nothing when the project manifest cannot be read', ({ manifestless }) => {
    expect(discoverKitPackages(manifestless.dir)).toStrictEqual([]);
  });
});

// region | Helpers

/** Installs a package into a fixture project, optionally publishing kits. */
function installPackage(temp: TempDir, name: string, kits: string[]): void {
  temp.writeJson(path.join('node_modules', name, 'package.json'), { name, version: '1.0.0' });
  temp.mkdir(path.join('node_modules', name, '.readyup', 'kits'));
  for (const kit of kits) {
    temp.write(path.join('node_modules', name, '.readyup', 'kits', `${kit}.js`), 'export default {};\n');
  }
}

// endregion | Helpers
