import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { expandConfiguredPackages } from '../expandConfiguredPackages.ts';

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  { scope: 'file' },
  makeFixture(() =>
    createTempTree(
      {
        'node_modules/@acme/kits/package.json': JSON.stringify({ name: '@acme/kits', version: '2.1.0' }),
        'node_modules/@acme/kits/.readyup/kits/drift.js': 'export default {};\n',
        'node_modules/@acme/kits/.readyup/kits/preflight.js': 'export default {};\n',
        'node_modules/@acme/kits/.readyup/manifest.json': JSON.stringify({
          version: 1,
          // Only one kit is described, so the pair covers both branches of an optional description.
          kits: [{ name: 'drift', description: 'Dependency drift' }, { name: 'preflight' }],
        }),

        // Kits on disk under a manifest nobody can parse.
        'node_modules/broken-manifest/package.json': JSON.stringify({ name: 'broken-manifest', version: '1.0.0' }),
        'node_modules/broken-manifest/.readyup/kits/drift.js': 'export default {};\n',
        'node_modules/broken-manifest/.readyup/manifest.json': '{ not json',

        // Installed, publishing nothing: an empty kit directory, not an absent one.
        'node_modules/kitless/package.json': JSON.stringify({ name: 'kitless', version: '1.0.0' }),
        'node_modules/kitless/.readyup/kits/': '',

        // Kits on disk with no manifest beside them.
        'node_modules/plain-kit/package.json': JSON.stringify({ name: 'plain-kit', version: '0.4.0' }),
        'node_modules/plain-kit/.readyup/kits/smoke.js': 'export default {};\n',
      },
      { prefix: 'expand-packages-' },
    ),
  ),
);

describe(expandConfiguredPackages, () => {
  it('expands a scoped package into the kits its manifest declares', ({ temp }) => {
    expect(expandConfiguredPackages(['@acme/kits'], '.js', temp.dir)).toStrictEqual([
      {
        packageName: '@acme/kits',
        version: '2.1.0',
        kitName: 'drift',
        description: 'Dependency drift',
        path: temp.resolve('node_modules/@acme/kits/.readyup/kits/drift.js'),
      },
      {
        packageName: '@acme/kits',
        version: '2.1.0',
        kitName: 'preflight',
        description: undefined,
        path: temp.resolve('node_modules/@acme/kits/.readyup/kits/preflight.js'),
      },
    ]);
  });

  // The same precedence a local `--from` source follows, so a package and a directory resolve alike.
  it('falls back to the kit directory when a package ships no manifest', ({ temp }) => {
    const [kit] = expandConfiguredPackages(['plain-kit'], '.js', temp.dir);

    expect(kit?.kitName).toBe('smoke');
    expect(kit?.version).toBe('0.4.0');
  });

  // Descriptions live in the manifest, so the directory fallback has none to report.
  it('leaves a kit undescribed when it comes from the directory fallback', ({ temp }) => {
    const [kit] = expandConfiguredPackages(['plain-kit'], '.js', temp.dir);

    expect(kit?.description).toBeUndefined();
  });

  it('expands every configured package, in configured order', ({ temp }) => {
    const kits = expandConfiguredPackages(['plain-kit', '@acme/kits'], '.js', temp.dir);

    expect(kits.map((kit) => `${kit.packageName}:${kit.kitName}`)).toStrictEqual([
      'plain-kit:smoke',
      '@acme/kits:drift',
      '@acme/kits:preflight',
    ]);
  });

  it('names the package when it is neither installed nor a workspace', ({ temp }) => {
    expect(() => expandConfiguredPackages(['absent-package'], '.js', temp.dir)).toThrow(
      /Configured package "absent-package" was not found/,
    );
  });

  it('names the package when it publishes no kits', ({ temp }) => {
    expect(() => expandConfiguredPackages(['kitless'], '.js', temp.dir)).toThrow(/Package "kitless" publishes no kits/);
  });

  // Falling back here would report a kit list the publisher never declared.
  it('surfaces a malformed manifest instead of reading around it', ({ temp }) => {
    expect(() => expandConfiguredPackages(['broken-manifest'], '.js', temp.dir)).toThrow(/invalid JSON/);
  });
});
