import { captureError, createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { afterEach, describe, expect, it as baseIt, vi } from 'vitest';

import { RdyError } from '../../errors/RdyError.ts';
import type { RemoteFetchContext } from '../../remote/createRemoteFetchContext.ts';
import { createUncachedRemoteContext } from '../../test-utils/createUncachedRemoteContext.ts';
import { mockResponse } from '../../test-utils/mockResponse.ts';
import { expandConfiguredSources, type SourceKit } from '../expandConfiguredSources.ts';
import { parseConfiguredSource } from '../parseConfiguredSource.ts';

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
          // Only one kit is described, so the pair covers both branches of each optional field.
          kits: [
            { name: 'drift', description: 'Dependency drift', checklists: ['lockfile', 'ranges'] },
            { name: 'preflight' },
          ],
        }),

        // Kits on disk under a manifest that nobody can parse.
        'node_modules/broken-manifest/package.json': JSON.stringify({ name: 'broken-manifest', version: '1.0.0' }),
        'node_modules/broken-manifest/.readyup/kits/drift.js': 'export default {};\n',
        'node_modules/broken-manifest/.readyup/manifest.json': '{ not json',

        // Installed, publishing nothing: An empty kit directory, not an absent one.
        'node_modules/kitless/package.json': JSON.stringify({ name: 'kitless', version: '1.0.0' }),
        'node_modules/kitless/.readyup/kits/': '',

        // Kits on disk with no manifest beside them.
        'node_modules/plain-kit/package.json': JSON.stringify({ name: 'plain-kit', version: '0.4.0' }),
        'node_modules/plain-kit/.readyup/kits/smoke.js': 'export default {};\n',
      },
      { prefix: 'expand-sources-' },
    ),
  ),
);

describe(expandConfiguredSources, () => {
  it('expands a scoped package into the kits declared by its manifest', async ({ temp }) => {
    await expect(expand(['@acme/kits'], temp.dir)).resolves.toStrictEqual([
      {
        source: 'npm:@acme/kits',
        version: '2.1.0',
        kitName: 'drift',
        description: 'Dependency drift',
        checklists: ['lockfile', 'ranges'],
        location: { path: temp.resolve('node_modules/@acme/kits/.readyup/kits/drift.js') },
        provenance: { kind: 'package', packageName: '@acme/kits', version: '2.1.0', source: 'npm:@acme/kits' },
      },
      {
        source: 'npm:@acme/kits',
        version: '2.1.0',
        kitName: 'preflight',
        description: undefined,
        checklists: undefined,
        location: { path: temp.resolve('node_modules/@acme/kits/.readyup/kits/preflight.js') },
        provenance: { kind: 'package', packageName: '@acme/kits', version: '2.1.0', source: 'npm:@acme/kits' },
      },
    ]);
  });

  // The same precedence that a local `--from` source follows, so that a package and a directory resolve alike.
  it('falls back to the kit directory when a package has no manifest', async ({ temp }) => {
    const [kit] = await expand(['plain-kit'], temp.dir);

    expect(kit?.kitName).toBe('smoke');
    expect(kit?.version).toBe('0.4.0');
  });

  // Descriptions and checklist names live in the manifest, so the directory fallback has neither to report.
  it('leaves a kit without a description or checklists when it comes from the directory fallback', async ({ temp }) => {
    const [kit] = await expand(['plain-kit'], temp.dir);

    expect(kit?.description).toBeUndefined();
    expect(kit?.checklists).toBeUndefined();
  });

  it('expands every configured package, in configured order', async ({ temp }) => {
    const kits = await expand(['plain-kit', '@acme/kits'], temp.dir);

    expect(kits.map((kit) => `${kit.source}:${kit.kitName}`)).toStrictEqual([
      'npm:plain-kit:smoke',
      'npm:@acme/kits:drift',
      'npm:@acme/kits:preflight',
    ]);
  });

  it('names the package when it is neither installed nor a workspace', async ({ temp }) => {
    await expect(expand(['absent-package'], temp.dir)).rejects.toThrow(
      /Configured source "npm:absent-package" was not found/,
    );
  });

  it('names the package when it publishes no kits', async ({ temp }) => {
    await expect(expand(['kitless'], temp.dir)).rejects.toThrow(/Configured source "npm:kitless" publishes no kits/);
  });

  // Falling back here would report a kit list that the publisher never declared.
  it('rejects a malformed manifest instead of reading around it', async ({ temp }) => {
    await expect(expand(['broken-manifest'], temp.dir)).rejects.toThrow(/invalid JSON/);
  });

  describe('a repository without a manifest', () => {
    const SPELLING_HINT = 'Check that the repository exists and that the ref names a branch, tag, or commit.';

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('hints at the spelling and the credential when no token was sent', async () => {
      const error = await expandMissingRepository({ cache: undefined, resolveAuthHeaders: () => undefined });

      expect(error.message).toMatch(/^Configured source "github:acme\/kits@nope": No manifest found at /);
      expect(error.hint).toBe(
        `${SPELLING_HINT} If the repository is private, set GITHUB_TOKEN or run \`gh auth login\`.`,
      );
    });

    it('hints at the spelling alone when a token was sent', async () => {
      const error = await expandMissingRepository({
        cache: undefined,
        resolveAuthHeaders: () => ({ Authorization: 'Bearer token' }),
      });

      expect(error.hint).toBe(SPELLING_HINT);
    });
  });
});

// region | Helpers

/** Expands installed packages, each named as a config's `npm:` source names it. */
async function expand(names: string[], fromDir: string): Promise<SourceKit[]> {
  const sources = names.map((name) => parseConfiguredSource(`npm:${name}`));
  return expandConfiguredSources(sources, '.js', createUncachedRemoteContext(), fromDir);
}

/** Expands a GitHub source whose manifest the host reports as absent, returning the error that it throws. */
async function expandMissingRepository(remote: RemoteFetchContext): Promise<RdyError> {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(mockResponse('', { status: 404, statusText: 'Not Found' }))),
  );

  return captureError(RdyError, () =>
    expandConfiguredSources([parseConfiguredSource('github:acme/kits@nope')], '.js', remote, process.cwd()),
  );
}

// endregion | Helpers
