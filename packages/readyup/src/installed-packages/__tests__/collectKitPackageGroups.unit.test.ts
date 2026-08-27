import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { collectKitPackageGroups, type KitPackageGroup } from '../collectKitPackageGroups.ts';

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  { scope: 'file' },
  makeFixture(() =>
    createTempTree(
      {
        // Declares two of the three installed kit publishers, so discovery and resolution disagree.
        'package.json': JSON.stringify({
          name: 'consumer',
          dependencies: { '@acme/kits': '1.0.0' },
          devDependencies: { 'plain-kit': '0.4.0' },
        }),

        'node_modules/@acme/kits/package.json': JSON.stringify({ name: '@acme/kits', version: '2.1.0' }),
        'node_modules/@acme/kits/.readyup/kits/drift.js': 'export default {};\n',
        'node_modules/@acme/kits/.readyup/kits/preflight.js': 'export default {};\n',
        'node_modules/@acme/kits/.readyup/manifest.json': JSON.stringify({
          version: 1,
          kits: [{ name: 'drift', description: 'Dependency drift' }, { name: 'preflight' }],
        }),

        // Installed and configured, but declared by nothing: only resolution reaches it.
        'node_modules/hidden-kit/package.json': JSON.stringify({ name: 'hidden-kit', version: '3.0.0' }),
        'node_modules/hidden-kit/.readyup/kits/audit.js': 'export default {};\n',

        // Installed, publishing nothing: an empty kit directory, not an absent one.
        'node_modules/kitless/package.json': JSON.stringify({ name: 'kitless', version: '1.0.0' }),
        'node_modules/kitless/.readyup/kits/': '',

        'node_modules/plain-kit/package.json': JSON.stringify({ name: 'plain-kit', version: '0.4.0' }),
        'node_modules/plain-kit/.readyup/kits/smoke.js': 'export default {};\n',
      },
      { prefix: 'kit-package-groups-' },
    ),
  ),
);

describe(collectKitPackageGroups, () => {
  it('unions the discovered dependencies with the configured ones, sorted by package name', ({ temp }) => {
    const groups = collect(['hidden-kit', 'plain-kit'], temp.dir);

    expect(groups.map((group) => group.packageName)).toStrictEqual(['@acme/kits', 'hidden-kit', 'plain-kit']);
  });

  // Only resolution reaches it, so discovery alone would drop a package the config points at.
  it('reports a configured package that no dependency field declares', ({ temp }) => {
    const group = collect(['hidden-kit'], temp.dir).find((one) => one.packageName === 'hidden-kit');

    expect(group?.configured).toBe(true);
    expect(group?.version).toBe('3.0.0');
    expect(group?.kits.map((kit) => kit.kitName)).toStrictEqual(['audit']);
  });

  it('reports a discovered package the config omits, with the kits it publishes', ({ temp }) => {
    const group = collect([], temp.dir).find((one) => one.packageName === '@acme/kits');

    expect(group?.configured).toBe(false);
    expect(group?.kits.map((kit) => kit.kitName)).toStrictEqual(['drift', 'preflight']);
  });

  it('reports the description a publisher records for its kit', ({ temp }) => {
    const group = collect([], temp.dir).find((one) => one.packageName === '@acme/kits');

    expect(group?.kits.map((kit) => kit.description)).toStrictEqual(['Dependency drift', undefined]);
  });

  it('reports a package that is both discovered and configured exactly once', ({ temp }) => {
    const groups = collect(['plain-kit'], temp.dir).filter((one) => one.packageName === 'plain-kit');

    expect(groups).toHaveLength(1);
    expect(groups[0]?.configured).toBe(true);
  });

  it('interleaves configured and unconfigured packages in one alphabetical list', ({ temp }) => {
    const groups = collect(['hidden-kit'], temp.dir);

    expect(groups.map((group) => `${group.packageName}:${group.configured}`)).toStrictEqual([
      '@acme/kits:false',
      'hidden-kit:true',
      'plain-kit:false',
    ]);
  });

  // Listing is read-only, so a dependency nobody can read costs its own group rather than the answer.
  it('warns and omits a configured package that cannot be resolved', ({ temp }) => {
    using io = captureStdio();

    const groups = collectKitPackageGroups({ configuredPackages: ['absent-package'], fromDir: temp.dir });

    expect(groups.map((group) => group.packageName)).not.toContain('absent-package');
    expect(io.stderr).toContain('Configured package "absent-package" was not found');
  });

  it('warns and omits a configured package that publishes no kits', ({ temp }) => {
    using io = captureStdio();

    const groups = collectKitPackageGroups({ configuredPackages: ['kitless'], fromDir: temp.dir });

    expect(groups.map((group) => group.packageName)).not.toContain('kitless');
    expect(io.stderr).toContain('Package "kitless" publishes no kits');
  });
});

// region | Helpers

/** Collects the groups, discarding the warnings an unreadable dependency would print. */
function collect(configuredPackages: string[], fromDir: string): KitPackageGroup[] {
  using _io = captureStdio();

  return collectKitPackageGroups({ configuredPackages, fromDir });
}

// endregion | Helpers
