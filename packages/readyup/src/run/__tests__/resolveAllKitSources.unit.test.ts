import path from 'node:path';

import { captureError, createTempTree, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { afterEach, describe, expect, it as baseIt, vi } from 'vitest';

vi.mock(import('../../remote/resolveGitHubToken.ts'), () => ({
  resolveGitHubToken: () => undefined,
}));

import { RdyError } from '../../errors/RdyError.ts';
import { createUncachedRemoteContext } from '../../test-utils/createUncachedRemoteContext.ts';
import { mockResponse } from '../../test-utils/mockResponse.ts';
import { resolveAllKitSources } from '../resolveAllKitSources.ts';
import { resolveKitSources } from '../resolveKitSources.ts';

/** Flags left inactive by a bare `--all`. */
const baseOptions = {
  fromValue: undefined,
  internal: false,
  jit: false,
  packages: false,
  remote: createUncachedRemoteContext(),
};

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'resolve-all-kit-sources-' })),
);

it.aroundEach(async (runTest, { temp }) => {
  using _cwd = pointCwdAt(temp.dir, { chdir: true });

  await runTest();
});

describe(resolveAllKitSources, () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('the project\u{2019}s compiled kits', () => {
    it('resolves every kit that the manifest records, from its recorded path', async ({ temp }) => {
      temp.writeJson('.readyup/manifest.json', {
        version: 1,
        kits: [
          { name: 'deploy', path: 'kits/deploy.js' },
          { name: 'smoke', path: 'kits/smoke.js' },
        ],
      });

      const entries = await resolveAllKitSources(baseOptions);

      expect(entries).toStrictEqual([
        { name: 'deploy', source: { path: path.join('.readyup', 'kits', 'deploy.js') }, checklists: [] },
        { name: 'smoke', source: { path: path.join('.readyup', 'kits', 'smoke.js') }, checklists: [] },
      ]);
    });

    it('resolves the bundles in the output directory when there is no manifest', async ({ temp }) => {
      temp.writeAll({ '.readyup/kits/deploy.js': '', '.readyup/kits/deploy.ts': '' });

      const entries = await resolveAllKitSources(baseOptions);

      expect(entries).toStrictEqual([
        { name: 'deploy', source: { path: path.join('.readyup', 'kits', 'deploy.js') }, checklists: [] },
      ]);
    });

    it('resolves a nested bundle when there is no manifest', async ({ temp }) => {
      temp.writeAll({ '.readyup/kits/ops/deploy.js': '', '.readyup/kits/top.js': '' });

      const entries = await resolveAllKitSources(baseOptions);

      expect(entries).toStrictEqual([
        { name: 'ops/deploy', source: { path: path.join('.readyup', 'kits', 'ops', 'deploy.js') }, checklists: [] },
        { name: 'top', source: { path: path.join('.readyup', 'kits', 'top.js') }, checklists: [] },
      ]);
    });

    it('reaches a relocated output directory through the paths that the manifest records', async ({ temp }) => {
      temp.writeJson('.readyup/manifest.json', { version: 1, kits: [{ name: 'lint', path: '../dist/kits/lint.js' }] });

      const entries = await resolveAllKitSources({
        ...baseOptions,
        compile: { srcDir: '.readyup/kits', outDir: 'dist/kits', include: undefined, exclude: [] },
      });

      expect(entries).toStrictEqual([
        { name: 'lint', source: { path: path.join('dist', 'kits', 'lint.js') }, checklists: [] },
      ]);
    });

    it('fails naming the output directory when nothing is compiled', async ({ temp }) => {
      temp.write('.readyup/kits/deploy.ts', '');

      const error = await captureError(RdyError, () => resolveAllKitSources(baseOptions));

      expect(error.code).toBe('kit-load');
      expect(error.message).toBe('--all found no compiled kits in .readyup/kits.');
      expect(error.hint).toBe('Run `rdy compile` to build them, or add --jit to run the TypeScript sources.');
    });
  });

  describe('sources reached by kit name', () => {
    it('resolves every TypeScript source under --jit, as naming each would', async ({ temp }) => {
      temp.writeAll({ '.readyup/kits/smoke.ts': '', '.readyup/kits/deploy.ts': '', '.readyup/kits/deploy.js': '' });

      const entries = await resolveAllKitSources({ ...baseOptions, jit: true });

      expect(entries).toStrictEqual(resolveKitSources({ ...buildNamedArgs(['deploy', 'smoke']), jit: true }));
    });

    it('resolves only the infixed kits of the internal directory under --internal', async ({ temp }) => {
      temp.writeAll({
        '.readyup/kits/deploy.ts': '',
        '.readyup/kits/internal/audit.int.ts': '',
        '.readyup/kits/internal/notes.ts': '',
      });
      const internalFlags = { internal: true, internalDir: 'internal', internalInfix: 'int', jit: true };

      const entries = await resolveAllKitSources({ ...baseOptions, ...internalFlags });

      expect(entries).toStrictEqual(resolveKitSources({ ...buildNamedArgs(['audit']), ...internalFlags }));
    });

    it('roots --internal on the configured source directory', async ({ temp }) => {
      temp.writeAll({ 'kits/src/internal/audit.ts': '', '.readyup/kits/internal/stale.ts': '' });
      const compile = { srcDir: 'kits/src', outDir: 'dist/kits', include: undefined, exclude: [] };
      const internalFlags = { internal: true, internalDir: 'internal', jit: true };

      const entries = await resolveAllKitSources({ ...baseOptions, ...internalFlags, compile });

      expect(entries).toStrictEqual(resolveKitSources({ ...buildNamedArgs(['audit']), ...internalFlags, compile }));
    });

    it('fails naming the directory when the kits directory contains no source', async () => {
      const error = await captureError(RdyError, () => resolveAllKitSources({ ...baseOptions, jit: true }));

      expect(error.code).toBe('kit-load');
      expect(error.message).toBe('--all found no kit sources in .readyup/kits.');
    });

    it('resolves a nested source under --jit, as naming it would', async ({ temp }) => {
      temp.writeAll({ '.readyup/kits/ops/deploy.ts': '', '.readyup/kits/top.ts': '' });

      const entries = await resolveAllKitSources({ ...baseOptions, jit: true });

      expect(entries).toStrictEqual(resolveKitSources({ ...buildNamedArgs(['ops/deploy', 'top']), jit: true }));
    });

    it('omits a source that compile.exclude removes', async ({ temp }) => {
      temp.writeAll({ '.readyup/kits/deploy.ts': '', '.readyup/kits/helpers/shared.ts': '' });
      const compile = { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined, exclude: ['helpers/**'] };

      const entries = await resolveAllKitSources({ ...baseOptions, jit: true, compile });

      expect(entries).toStrictEqual(resolveKitSources({ ...buildNamedArgs(['deploy']), jit: true, compile }));
    });

    it('omits a source that compile.include does not select', async ({ temp }) => {
      temp.writeAll({ '.readyup/kits/deploy.ts': '', '.readyup/kits/helpers/shared.ts': '' });
      const compile = { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: ['*.ts'], exclude: [] };

      const entries = await resolveAllKitSources({ ...baseOptions, jit: true, compile });

      expect(entries).toStrictEqual(resolveKitSources({ ...buildNamedArgs(['deploy']), jit: true, compile }));
    });

    it('covers the same kits under --jit as a compiled --all', async ({ temp }) => {
      temp.writeAll({
        '.readyup/kits/ops/deploy.js': '',
        '.readyup/kits/ops/deploy.ts': '',
        '.readyup/kits/smoke.js': '',
        '.readyup/kits/smoke.ts': '',
      });

      const compiled = await resolveAllKitSources(baseOptions);
      const sources = await resolveAllKitSources({ ...baseOptions, jit: true });

      expect(sources.map((entry) => entry.name)).toStrictEqual(compiled.map((entry) => entry.name));
    });

    it('resolves every kit that a --from directory contains, as naming each would', async ({ temp }) => {
      temp.writeAll({ 'shared/beta.js': '', 'shared/alpha.js': '' });

      const entries = await resolveAllKitSources({ ...baseOptions, fromValue: 'dir:shared' });

      expect(entries).toStrictEqual(
        resolveKitSources({ ...buildNamedArgs(['alpha', 'beta']), fromValue: 'dir:shared' }),
      );
    });

    it('resolves every kit that a remote manifest records into the URL from which each is fetched', async () => {
      const manifest = { version: 1, kits: [{ name: 'default' }, { name: 'deploy' }] };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(JSON.stringify(manifest))));

      const entries = await resolveAllKitSources({ ...baseOptions, fromValue: 'github:acme/checks' });

      expect(entries).toStrictEqual(
        resolveKitSources({ ...buildNamedArgs(['default', 'deploy']), fromValue: 'github:acme/checks' }),
      );
    });

    it('fails naming the --from source when its manifest records no kits', async ({ temp }) => {
      temp.writeJson('shared/manifest.json', { version: 1, kits: [] });

      const error = await captureError(RdyError, () =>
        resolveAllKitSources({ ...baseOptions, fromValue: 'dir:shared' }),
      );

      expect(error.code).toBe('kit-load');
      expect(error.message).toBe('--all found no kits in dir:shared.');
    });
  });

  it('resolves every kit that a configured package publishes under --packages, not only its default', async ({
    temp,
  }) => {
    temp.writeJson('node_modules/@acme/kits/package.json', { name: '@acme/kits' });
    temp.writeJson('node_modules/@acme/kits/.readyup/manifest.json', {
      version: 1,
      kits: [{ name: 'default' }, { name: 'drift' }],
    });

    const entries = await resolveAllKitSources({ ...baseOptions, packages: true, configuredPackages: ['@acme/kits'] });

    expect(entries.map((entry) => entry.name)).toStrictEqual(['default', 'drift']);
  });
});

// region | Helpers

/** Builds the `resolveKitSources` arguments of a run naming the given kits, every other flag inactive. */
function buildNamedArgs(names: string[]) {
  return {
    checklists: undefined,
    filePath: undefined,
    fromValue: undefined,
    internal: false,
    jit: false,
    kitSpecifiers: names.map((kitName) => ({ kitName, checklists: [] })),
    urlValue: undefined,
  };
}

// endregion | Helpers
