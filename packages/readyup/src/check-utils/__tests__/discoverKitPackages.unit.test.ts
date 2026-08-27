import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { discoverKitPackages } from '../discoverKitPackages.ts';

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  { scope: 'file' },
  makeFixture(() =>
    createTempTree(
      {
        'package.json': JSON.stringify({
          name: 'consumer',
          dependencies: { 'zebra-kit': '1.0.0' },
          devDependencies: { '@acme/kits': '1.0.0', kitless: '1.0.0' },
        }),

        'node_modules/@acme/kits/package.json': JSON.stringify({ name: '@acme/kits', version: '1.0.0' }),
        'node_modules/@acme/kits/.readyup/kits/drift.js': 'export default {};\n',

        // Declared and installed, publishing nothing: an empty kit directory, not an absent one.
        'node_modules/kitless/package.json': JSON.stringify({ name: 'kitless', version: '1.0.0' }),
        'node_modules/kitless/.readyup/kits/': '',

        // Installed and publishing kits, but never declared as a dependency.
        'node_modules/undeclared-kit/package.json': JSON.stringify({ name: 'undeclared-kit', version: '1.0.0' }),
        'node_modules/undeclared-kit/.readyup/kits/drift.js': 'export default {};\n',

        'node_modules/zebra-kit/package.json': JSON.stringify({ name: 'zebra-kit', version: '1.0.0' }),
        'node_modules/zebra-kit/.readyup/kits/smoke.js': 'export default {};\n',
      },
      { prefix: 'discover-packages-' },
    ),
  ),
);

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

  it('returns an empty list when the project manifest cannot be read', () => {
    using manifestless = createTempTree({}, { prefix: 'discover-no-manifest-' });

    expect(discoverKitPackages(manifestless.dir)).toStrictEqual([]);
  });
});
