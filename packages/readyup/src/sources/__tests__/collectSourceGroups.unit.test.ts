import { captureStdio, createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { afterEach, describe, expect, it as baseIt, vi } from 'vitest';

vi.mock(import('../../remote/resolveGitHubToken.ts'), () => ({
  resolveGitHubToken: () => undefined,
}));

import { createUncachedRemoteContext } from '../../test-utils/createUncachedRemoteContext.ts';
import { mockResponse } from '../../test-utils/mockResponse.ts';
import { collectSourceGroups, type SourceGroup } from '../collectSourceGroups.ts';
import { parseConfiguredSource } from '../parseConfiguredSource.ts';

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

        // Installed and configured, but declared by nothing: Only resolution reaches it.
        'node_modules/hidden-kit/package.json': JSON.stringify({ name: 'hidden-kit', version: '3.0.0' }),
        'node_modules/hidden-kit/.readyup/kits/audit.js': 'export default {};\n',

        // Installed, publishing nothing: An empty kit directory, not an absent one.
        'node_modules/kitless/package.json': JSON.stringify({ name: 'kitless', version: '1.0.0' }),
        'node_modules/kitless/.readyup/kits/': '',

        'node_modules/plain-kit/package.json': JSON.stringify({ name: 'plain-kit', version: '0.4.0' }),
        'node_modules/plain-kit/.readyup/kits/smoke.js': 'export default {};\n',
      },
      { prefix: 'source-groups-' },
    ),
  ),
);

describe(collectSourceGroups, () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('unions the discovered dependencies with the configured ones, sorted by package name', async ({ temp }) => {
    const groups = await collect(['npm:hidden-kit', 'npm:plain-kit'], temp.dir);

    expect(groups.map((group) => group.name)).toStrictEqual(['@acme/kits', 'hidden-kit', 'plain-kit']);
  });

  // Only resolution reaches it, so discovery alone would drop a package that the config points at.
  it('reports a configured package that no dependency field declares', async ({ temp }) => {
    const group = (await collect(['npm:hidden-kit'], temp.dir)).find((one) => one.name === 'hidden-kit');

    expect(group?.configured).toBe(true);
    expect(group?.version).toBe('3.0.0');
    expect(group?.kits.map((kit) => kit.kitName)).toStrictEqual(['audit']);
  });

  it('reports a discovered package omitted by the config, with the kits that it publishes', async ({ temp }) => {
    const group = (await collect([], temp.dir)).find((one) => one.name === '@acme/kits');

    expect(group?.configured).toBe(false);
    expect(group?.kits.map((kit) => kit.kitName)).toStrictEqual(['drift', 'preflight']);
  });

  it('reports the description that a publisher records for its kit', async ({ temp }) => {
    const group = (await collect([], temp.dir)).find((one) => one.name === '@acme/kits');

    expect(group?.kits.map((kit) => kit.description)).toStrictEqual(['Dependency drift', undefined]);
  });

  it('reports a package that is both discovered and configured exactly once', async ({ temp }) => {
    const groups = (await collect(['npm:plain-kit'], temp.dir)).filter((one) => one.name === 'plain-kit');

    expect(groups).toHaveLength(1);
    expect(groups[0]?.configured).toBe(true);
  });

  it('interleaves configured and unconfigured packages in one alphabetical list', async ({ temp }) => {
    const groups = await collect(['npm:hidden-kit'], temp.dir);

    expect(groups.map((group) => `${group.name}:${group.configured}`)).toStrictEqual([
      '@acme/kits:false',
      'hidden-kit:true',
      'plain-kit:false',
    ]);
  });

  // Because listing is read-only, a dependency that nobody can read loses only its own group, not the whole listing.
  it('warns and omits a configured source that cannot be resolved', async ({ temp }) => {
    using io = captureStdio();

    const groups = await collectSourceGroups({
      configuredSources: [parseConfiguredSource('npm:absent-package')],
      fromDir: temp.dir,
      remote: createUncachedRemoteContext(),
    });

    expect(groups.map((group) => group.name)).not.toContain('absent-package');
    expect(io.stderr).toContain('Configured source "npm:absent-package" was not found');
  });

  it('lists a configured repository after the packages, under its spelling', async ({ temp }) => {
    serveManifest('https://raw.githubusercontent.com/acme/.github/v2/.readyup/manifest.json', [
      { name: 'callers', description: 'Callers of the reusable workflow' },
    ]);

    const groups = await collect(['github:acme/.github@v2', 'npm:hidden-kit'], temp.dir);

    expect(groups.map((group) => `${group.kind}:${group.name}:${group.configured}`)).toStrictEqual([
      'package:@acme/kits:false',
      'package:hidden-kit:true',
      'package:plain-kit:false',
      'repository:github:acme/.github@v2:true',
    ]);
    expect(groups.at(-1)?.kits.map((kit) => kit.description)).toStrictEqual(['Callers of the reusable workflow']);
  });

  it('warns and omits a configured repository whose manifest cannot be fetched', async ({ temp }) => {
    using io = captureStdio();
    serveManifest('https://example.invalid/', []);

    const groups = await collectSourceGroups({
      configuredSources: [parseConfiguredSource('github:acme/standards')],
      fromDir: temp.dir,
      remote: createUncachedRemoteContext(),
    });

    expect(groups.map((group) => group.kind)).not.toContain('repository');
    expect(io.stderr).toContain('Configured source "github:acme/standards"');
  });

  it('warns and omits a configured source that publishes no kits', async ({ temp }) => {
    using io = captureStdio();

    const groups = await collectSourceGroups({
      configuredSources: [parseConfiguredSource('npm:kitless')],
      fromDir: temp.dir,
      remote: createUncachedRemoteContext(),
    });

    expect(groups.map((group) => group.name)).not.toContain('kitless');
    expect(io.stderr).toContain('Configured source "npm:kitless" publishes no kits');
  });
});

// region | Helpers

/** Collects the groups for sources spelled as a config writes them, discarding the warnings for an unreadable one. */
async function collect(entries: string[], fromDir: string): Promise<SourceGroup[]> {
  using _io = captureStdio();

  const configuredSources = entries.map((entry) => parseConfiguredSource(entry));
  return await collectSourceGroups({ configuredSources, fromDir, remote: createUncachedRemoteContext() });
}

/** Serves one manifest URL a manifest listing the given kits, and every other URL as absent. */
function serveManifest(manifestUrl: string, kits: Array<{ name: string; description?: string }>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        url === manifestUrl
          ? mockResponse(JSON.stringify({ version: 1, kits }))
          : mockResponse('', { status: 404, statusText: 'Not Found' }),
      ),
    ),
  );
}

// endregion | Helpers
