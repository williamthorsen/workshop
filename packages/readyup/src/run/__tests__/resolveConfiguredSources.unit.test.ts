import path from 'node:path';

import { captureError, createTempTree, pointCwdAt, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { afterEach, describe, expect, it as baseIt, vi } from 'vitest';

vi.mock(import('../../remote/resolveBitbucketToken.ts'), () => ({
  resolveBitbucketToken: () => undefined,
}));

vi.mock(import('../../remote/resolveGitHubToken.ts'), () => ({
  resolveGitHubToken: () => undefined,
}));

import { RdyError } from '../../errors/RdyError.ts';
import { formatRepositoryLabel } from '../../kits/KitProvenance.ts';
import { parseConfiguredSource } from '../../sources/parseConfiguredSource.ts';
import { createUncachedRemoteContext } from '../../test-utils/createUncachedRemoteContext.ts';
import { mockResponse } from '../../test-utils/mockResponse.ts';
import { resolveConfiguredSources } from '../resolveConfiguredSources.ts';
import type { ResolvedKitEntry } from '../ResolvedKitEntry.ts';

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'resolve-configured-sources-' })),
);

it.aroundEach(async (runTest, { temp }) => {
  using _cwd = pointCwdAt(temp.dir, { chdir: true });

  await runTest();
});

describe(resolveConfiguredSources, () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('expands a configured package into an entry per requested kit', async ({ temp }) => {
    installPackage(temp, '@acme/kits', ['default'], '2.1.0');

    await expect(resolve(['npm:@acme/kits'], ['default'], '.js')).resolves.toStrictEqual([
      {
        name: 'default',
        source: { path: path.join(temp.dir, 'node_modules', '@acme/kits', '.readyup', 'kits', 'default.js') },
        checklists: [],
        provenance: { kind: 'package', packageName: '@acme/kits', version: '2.1.0', source: 'npm:@acme/kits' },
      },
    ]);
  });

  it('orders the entries name-major across the configured packages', async ({ temp }) => {
    installPackage(temp, '@acme/kits', ['default', 'preflight']);
    installPackage(temp, '@beta/kits', ['default', 'preflight']);

    const entries = await resolve(['npm:@acme/kits', 'npm:@beta/kits'], ['preflight', 'default'], '.js');

    expect(entries.map(describeEntry)).toStrictEqual([
      '@acme/kits:preflight',
      '@beta/kits:preflight',
      '@acme/kits:default',
      '@beta/kits:default',
    ]);
  });

  it('selects every published kit under "all", package by package in configured order', async ({ temp }) => {
    installPackage(temp, '@acme/kits', ['default', 'preflight']);
    installPackage(temp, '@beta/kits', ['default', 'drift']);

    const entries = await resolve(['npm:@beta/kits', 'npm:@acme/kits'], 'all', '.js');

    expect(entries.map(describeEntry)).toStrictEqual([
      '@beta/kits:default',
      '@beta/kits:drift',
      '@acme/kits:default',
      '@acme/kits:preflight',
    ]);
  });

  // A package publishing nothing under a name requires nothing, so it is not a failure of the run.
  it('skips a configured package that publishes no requested kit', async ({ temp }) => {
    installPackage(temp, '@acme/kits', ['default', 'preflight']);
    installPackage(temp, '@beta/kits', ['default']);

    const entries = await resolve(['npm:@acme/kits', 'npm:@beta/kits'], ['preflight'], '.js');

    expect(entries.map(describeEntry)).toStrictEqual(['@acme/kits:preflight']);
  });

  // Because a bare `--packages` fills the name in, a name that no package publishes is the "requires nothing" case.
  it('resolves to an empty list when no configured package publishes the default kit', async ({ temp }) => {
    installPackage(temp, '@acme/kits', ['preflight']);

    await expect(resolve(['npm:@acme/kits'], ['default'], '.js')).resolves.toStrictEqual([]);
  });

  // Returning an empty pass would be the clean report of nothing checked.
  it('rejects a named kit published by no configured package', async ({ temp }) => {
    installPackage(temp, '@acme/kits', ['default', 'preflight']);

    const error = await captureError(RdyError, () => resolve(['npm:@acme/kits'], ['absent'], '.js'));

    expect(error.code).toBe('usage');
    expect(error.message).toBe(
      'No configured source publishes a kit named "absent"; available kits: default, preflight.',
    );
  });

  it('rejects an empty configured-sources list, which no config declared', async () => {
    const error = await captureError(RdyError, () => resolve([], ['default'], '.js'));

    expect(error.code).toBe('usage');
    expect(error.message).toMatch(/requires a "sources" list/);
  });

  it('expands a repository source through its manifest, in configured order among packages', async ({ temp }) => {
    installPackage(temp, '@acme/kits', ['default']);
    serveManifests({
      'https://raw.githubusercontent.com/acme/.github/v2/.readyup/manifest.json': ['default', 'drift'],
    });

    const entries = await resolve(['github:acme/.github@v2', 'npm:@acme/kits'], 'all', '.js');

    expect(entries.map(describeEntry)).toStrictEqual([
      'github:acme/.github@v2:default',
      'github:acme/.github@v2:drift',
      '@acme/kits:default',
    ]);
    expect(entries[0]).toStrictEqual({
      name: 'default',
      source: { url: 'https://raw.githubusercontent.com/acme/.github/v2/.readyup/kits/default.js' },
      checklists: [],
      provenance: {
        kind: 'repository',
        host: 'github',
        owner: 'acme',
        repo: '.github',
        ref: 'v2',
        source: 'github:acme/.github@v2',
      },
    });
  });

  it('reads a Bitbucket source from its default branch when the entry names no ref', async () => {
    serveManifests({
      'https://api.bitbucket.org/2.0/repositories/acme/standards/src/main/.readyup/manifest.json': ['default'],
    });

    const entries = await resolve(['bitbucket:acme/standards'], ['default'], '.js');

    expect(entries.map((entry) => entry.source)).toStrictEqual([
      { url: 'https://api.bitbucket.org/2.0/repositories/acme/standards/src/main/.readyup/kits/default.js' },
    ]);
  });

  it('skips a repository source that publishes no requested kit', async ({ temp }) => {
    installPackage(temp, '@acme/kits', ['default', 'drift']);
    serveManifests({ 'https://raw.githubusercontent.com/acme/standards/main/.readyup/manifest.json': ['default'] });

    const entries = await resolve(['npm:@acme/kits', 'github:acme/standards'], ['drift'], '.js');

    expect(entries.map(describeEntry)).toStrictEqual(['@acme/kits:drift']);
  });

  it('fails naming a repository source whose manifest cannot be fetched', async () => {
    serveManifests({});

    const error = await captureError(RdyError, () => resolve(['github:acme/standards'], ['default'], '.js'));

    expect(error.code).toBe('config');
    expect(error.message).toMatch(/^Configured source "github:acme\/standards": /);
    expect(error.message).toContain('https://raw.githubusercontent.com/acme/standards/main/.readyup/manifest.json');
  });

  it('fails naming a repository source whose manifest lists no kits', async () => {
    serveManifests({ 'https://raw.githubusercontent.com/acme/standards/main/.readyup/manifest.json': [] });

    const error = await captureError(RdyError, () => resolve(['github:acme/standards'], ['default'], '.js'));

    expect(error.code).toBe('config');
    expect(error.message).toMatch(/^Configured source "github:acme\/standards" publishes no kits/);
  });

  it('applies the extension that it is given to every kit path', async ({ temp }) => {
    installPackage(temp, '@acme/kits', ['default']);

    await expect(resolve(['npm:@acme/kits'], ['default'], '.ts')).resolves.toStrictEqual([
      {
        name: 'default',
        source: { path: path.join(temp.dir, 'node_modules', '@acme/kits', '.readyup', 'kits', 'default.ts') },
        checklists: [],
        provenance: { kind: 'package', packageName: '@acme/kits', version: undefined, source: 'npm:@acme/kits' },
      },
    ]);
  });
});

// region | Helpers

/** Resolves the requested kits from sources spelled as a config writes them. */
async function resolve(
  entries: string[],
  requestedNames: string[] | 'all',
  extension: string,
): Promise<ResolvedKitEntry[]> {
  return resolveConfiguredSources(
    entries.map((entry) => parseConfiguredSource(entry)),
    requestedNames,
    extension,
    createUncachedRemoteContext(),
  );
}

/** Serves each manifest URL a manifest listing the named kits, and every other URL as absent. */
function serveManifests(manifests: Record<string, string[]>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const kits = manifests[url];
      return Promise.resolve(
        kits === undefined
          ? mockResponse('', { status: 404, statusText: 'Not Found' })
          : mockResponse(JSON.stringify({ version: 1, kits: kits.map((name) => ({ name })) })),
      );
    }),
  );
}

/**
 * Names a run entry as the source from which it came and the kit that it runs, which is what an order
 * assertion reads.
 */
function describeEntry({ name, provenance }: ResolvedKitEntry): string {
  if (provenance?.kind === 'package') return `${provenance.packageName}:${name}`;
  if (provenance?.kind === 'repository') return `${formatRepositoryLabel(provenance)}:${name}`;
  return `${provenance?.kind}:${name}`;
}

/**
 * Installs a package declaring the named kits in its manifest.
 *
 * The kit files themselves are left unwritten: This resolver names where a kit would be read from and
 * never opens it, so a fixture that wrote them would prove nothing the manifest does not already say.
 */
function installPackage(temp: TempTree, name: string, kits: string[], version?: string): void {
  const root = path.join('node_modules', name);
  temp.writeJson(path.join(root, 'package.json'), { name, ...(version !== undefined && { version }) });
  temp.writeJson(path.join(root, '.readyup', 'manifest.json'), {
    version: 1,
    kits: kits.map((kit) => ({ name: kit })),
  });
}

// endregion | Helpers
