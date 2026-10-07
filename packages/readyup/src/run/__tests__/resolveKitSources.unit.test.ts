import path from 'node:path';

import { captureError } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { RdyError } from '../../errors/RdyError.ts';
import { createUncachedRemoteContext } from '../../test-utils/createUncachedRemoteContext.ts';
import { resolveKitSources } from '../resolveKitSources.ts';

/** Compile directories that share no segment with the convention layout, so that a fallback cannot pass as a read. */
const RELOCATED = { srcDir: 'kits/src', outDir: 'dist/kits' };

describe(resolveKitSources, () => {
  // -- Default resolution (compiled .js) --

  it('resolves default kit path to .js', async () => {
    await expect(resolve()).resolves.toStrictEqual([
      { name: 'default', source: { path: '.readyup/kits/default.js' }, checklists: [] },
    ]);
  });

  it('resolves named kit from positional specifier', async () => {
    await expect(resolve({ kitSpecifiers: [{ kitName: 'deploy', checklists: [] }] })).resolves.toStrictEqual([
      { name: 'deploy', source: { path: '.readyup/kits/deploy.js' }, checklists: [] },
    ]);
  });

  it('resolves slash-separated kit name', async () => {
    await expect(resolve({ kitSpecifiers: [{ kitName: 'shared/deploy', checklists: [] }] })).resolves.toStrictEqual([
      { name: 'shared/deploy', source: { path: '.readyup/kits/shared/deploy.js' }, checklists: [] },
    ]);
  });

  it('applies --checklists to the named kit', async () => {
    await expect(
      resolve({ kitSpecifiers: [{ kitName: 'deploy', checklists: [] }], checklists: ['build', 'test'] }),
    ).resolves.toStrictEqual([
      { name: 'deploy', source: { path: '.readyup/kits/deploy.js' }, checklists: ['build', 'test'] },
    ]);
  });

  it('applies --checklists to the default kit when no kit is named', async () => {
    await expect(resolve({ checklists: ['build'] })).resolves.toStrictEqual([
      { name: 'default', source: { path: '.readyup/kits/default.js' }, checklists: ['build'] },
    ]);
  });

  // -- --jit flag --

  it('resolves to .ts with --jit', async () => {
    await expect(resolve({ jit: true })).resolves.toStrictEqual([
      { name: 'default', source: { path: '.readyup/kits/default.ts' }, checklists: [] },
    ]);
  });

  // -- --internal flag --

  it('applies internal dir with --internal', async () => {
    await expect(resolve({ internal: true, internalDir: 'internal' })).resolves.toStrictEqual([
      { name: 'default', source: { path: '.readyup/kits/internal/default.js' }, checklists: [] },
    ]);
  });

  it('applies internal dir and infix with --internal', async () => {
    await expect(resolve({ internal: true, internalDir: 'internal', internalInfix: 'int' })).resolves.toStrictEqual([
      { name: 'default', source: { path: '.readyup/kits/internal/default.int.js' }, checklists: [] },
    ]);
  });

  it('combines --jit and --internal', async () => {
    await expect(
      resolve({ jit: true, internal: true, internalDir: 'internal', internalInfix: 'int' }),
    ).resolves.toStrictEqual([
      { name: 'default', source: { path: '.readyup/kits/internal/default.int.ts' }, checklists: [] },
    ]);
  });

  it('falls back to the conventional kit directory when --internal names none', async () => {
    await expect(resolve({ internal: true, internalDir: undefined })).resolves.toStrictEqual([
      { name: 'default', source: { path: '.readyup/kits/default.js' }, checklists: [] },
    ]);
  });

  it('applies internal dir with named kit', async () => {
    await expect(
      resolve({
        kitSpecifiers: [{ kitName: 'deploy', checklists: [] }],
        internal: true,
        internalDir: 'internal',
        internalInfix: 'int',
      }),
    ).resolves.toStrictEqual([
      { name: 'deploy', source: { path: '.readyup/kits/internal/deploy.int.js' }, checklists: [] },
    ]);
  });

  // -- Configured compile directories --

  it('resolves a named kit against compile.outDir', async () => {
    await expect(
      resolve({ kitSpecifiers: [{ kitName: 'deploy', checklists: [] }], compile: RELOCATED }),
    ).resolves.toStrictEqual([
      { name: 'deploy', source: { path: path.join('dist', 'kits', 'deploy.js') }, checklists: [] },
    ]);
  });

  it('resolves a --jit kit against compile.srcDir', async () => {
    await expect(
      resolve({ kitSpecifiers: [{ kitName: 'deploy', checklists: [] }], jit: true, compile: RELOCATED }),
    ).resolves.toStrictEqual([
      { name: 'deploy', source: { path: path.join('kits', 'src', 'deploy.ts') }, checklists: [] },
    ]);
  });

  it('roots --internal on compile.outDir', async () => {
    await expect(resolve({ internal: true, internalDir: 'internal', compile: RELOCATED })).resolves.toStrictEqual([
      { name: 'default', source: { path: path.join('dist', 'kits', 'internal', 'default.js') }, checklists: [] },
    ]);
  });

  it('roots --jit --internal on compile.srcDir', async () => {
    await expect(
      resolve({ jit: true, internal: true, internalDir: 'internal', internalInfix: 'int', compile: RELOCATED }),
    ).resolves.toStrictEqual([
      { name: 'default', source: { path: path.join('kits', 'src', 'internal', 'default.int.ts') }, checklists: [] },
    ]);
  });

  // -- --file flag --

  it('resolves --file to a single path source entry', async () => {
    await expect(resolve({ filePath: 'custom/path.ts' })).resolves.toStrictEqual([
      {
        name: 'path',
        source: { path: 'custom/path.ts' },
        checklists: [],
        provenance: { kind: 'directory', label: 'custom' },
      },
    ]);
  });

  it('resolves --file with --checklists', async () => {
    await expect(resolve({ filePath: 'custom/path.ts', checklists: ['c1', 'c2'] })).resolves.toStrictEqual([
      {
        name: 'path',
        source: { path: 'custom/path.ts' },
        checklists: ['c1', 'c2'],
        provenance: { kind: 'directory', label: 'custom' },
      },
    ]);
  });

  it('resolves --file without internalDir/internalInfix', async () => {
    await expect(
      resolveKitSources({
        remote: createUncachedRemoteContext(),
        filePath: 'custom/path.ts',
        fromValue: undefined,
        urlValue: undefined,
        kitSpecifiers: [],
        checklists: undefined,
        jit: false,
        internal: false,
      }),
    ).resolves.toStrictEqual([
      {
        name: 'path',
        source: { path: 'custom/path.ts' },
        checklists: [],
        provenance: { kind: 'directory', label: 'custom' },
      },
    ]);
  });

  // -- --url flag --

  it('resolves --url to a URL source', async () => {
    await expect(resolve({ urlValue: 'https://example.com/config.js' })).resolves.toStrictEqual([
      {
        name: 'config',
        source: { url: 'https://example.com/config.js' },
        checklists: [],
        provenance: { kind: 'remote', label: 'example.com/config.js' },
      },
    ]);
  });

  it('resolves --url with --checklists', async () => {
    await expect(
      resolve({ urlValue: 'https://example.com/config.js', checklists: ['c1', 'c2'] }),
    ).resolves.toStrictEqual([
      {
        name: 'config',
        source: { url: 'https://example.com/config.js' },
        checklists: ['c1', 'c2'],
        provenance: { kind: 'remote', label: 'example.com/config.js' },
      },
    ]);
  });

  it('resolves --url without internalDir/internalInfix', async () => {
    await expect(
      resolveKitSources({
        remote: createUncachedRemoteContext(),
        filePath: undefined,
        fromValue: undefined,
        urlValue: 'https://example.com/kit.js',
        kitSpecifiers: [],
        checklists: undefined,
        jit: false,
        internal: false,
      }),
    ).resolves.toStrictEqual([
      {
        name: 'kit',
        source: { url: 'https://example.com/kit.js' },
        checklists: [],
        provenance: { kind: 'remote', label: 'example.com/kit.js' },
      },
    ]);
  });

  it('names an unparseable --url value exactly as given', async () => {
    await expect(resolve({ urlValue: 'not a url' })).resolves.toStrictEqual([
      {
        name: 'not a url',
        source: { url: 'not a url' },
        checklists: [],
        provenance: { kind: 'remote', label: 'not a url' },
      },
    ]);
  });

  // -- --from flag --

  it('resolves --from without internalDir/internalInfix', async () => {
    await expect(
      resolveKitSources({
        remote: createUncachedRemoteContext(),
        filePath: undefined,
        fromValue: 'github:org/repo',
        urlValue: undefined,
        kitSpecifiers: [{ kitName: 'deploy', checklists: [] }],
        checklists: undefined,
        jit: false,
        internal: false,
      }),
    ).resolves.toStrictEqual([
      {
        name: 'deploy',
        source: { url: 'https://raw.githubusercontent.com/org/repo/main/.readyup/kits/deploy.js' },
        checklists: [],
        provenance: {
          kind: 'repository',
          host: 'github',
          owner: 'org',
          repo: 'repo',
          ref: 'main',
          source: 'github:org/repo',
        },
      },
    ]);
  });

  it('defaults the --from kit to "default"', async () => {
    await expect(resolve({ fromValue: 'github:org/repo' })).resolves.toStrictEqual([
      {
        name: 'default',
        source: { url: 'https://raw.githubusercontent.com/org/repo/main/.readyup/kits/default.js' },
        checklists: [],
        provenance: {
          kind: 'repository',
          host: 'github',
          owner: 'org',
          repo: 'repo',
          ref: 'main',
          source: 'github:org/repo',
        },
      },
    ]);
  });

  it('reports a --from value that does not parse as a usage error', async () => {
    const error = await captureError(RdyError, () => resolve({ fromValue: 'https://example.com/kit.js' }));

    expect(error.code).toBe('usage');
    expect(error.message).toMatch(/URLs are not accepted by --from/);
  });

  // -- --packages flag --

  // The flag names a config key, so a call that passes no value for the key is the same case as one that passes an
  // empty list.
  it('reports --packages against a config that declares no sources as a usage error', async () => {
    const error = await captureError(RdyError, () => resolve({ packages: true }));

    expect(error.code).toBe('usage');
    expect(error.message).toMatch(/requires a "sources" list/);
  });

  // -- Isolation of internal config with source flags --

  it('ignores internal config when --file is used', async () => {
    await expect(
      resolve({ filePath: 'custom/path.ts', internal: true, internalDir: 'internal', internalInfix: 'int' }),
    ).resolves.toStrictEqual([
      {
        name: 'path',
        source: { path: 'custom/path.ts' },
        checklists: [],
        provenance: { kind: 'directory', label: 'custom' },
      },
    ]);
  });

  it('ignores internal config when --from is used', async () => {
    await expect(
      resolve({ fromValue: 'github:org/repo', internal: false, internalDir: 'internal', internalInfix: 'int' }),
    ).resolves.toStrictEqual([
      {
        name: 'default',
        source: { url: 'https://raw.githubusercontent.com/org/repo/main/.readyup/kits/default.js' },
        checklists: [],
        provenance: {
          kind: 'repository',
          host: 'github',
          owner: 'org',
          repo: 'repo',
          ref: 'main',
          source: 'github:org/repo',
        },
      },
    ]);
  });

  it('ignores internal config when --url is used', async () => {
    await expect(
      resolve({
        urlValue: 'https://example.com/config.js',
        internal: true,
        internalDir: 'internal',
        internalInfix: 'int',
      }),
    ).resolves.toStrictEqual([
      {
        name: 'config',
        source: { url: 'https://example.com/config.js' },
        checklists: [],
        provenance: { kind: 'remote', label: 'example.com/config.js' },
      },
    ]);
  });
});

// region | Helpers

/** Builds args with defaults for internal config. */
function resolve(
  overrides: Partial<Parameters<typeof resolveKitSources>[0]> = {},
): ReturnType<typeof resolveKitSources> {
  return resolveKitSources({
    filePath: undefined,
    fromValue: undefined,
    urlValue: undefined,
    kitSpecifiers: [],
    checklists: undefined,
    jit: false,
    internal: false,
    internalDir: '.',
    internalInfix: undefined,
    remote: createUncachedRemoteContext(),
    ...overrides,
  });
}

// endregion | Helpers
