import { captureError } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { RdyError } from '../../errors/RdyError.ts';
import { resolveKitSources } from '../resolveKitSources.ts';

describe(resolveKitSources, () => {
  // -- Default resolution (compiled .js) --

  it('resolves default kit path to .js', () => {
    expect(resolve()).toStrictEqual([
      { name: 'default', source: { path: '.readyup/kits/default.js' }, checklists: [] },
    ]);
  });

  it('resolves named kit from positional specifier', () => {
    expect(resolve({ kitSpecifiers: [{ kitName: 'deploy', checklists: [] }] })).toStrictEqual([
      { name: 'deploy', source: { path: '.readyup/kits/deploy.js' }, checklists: [] },
    ]);
  });

  it('resolves slash-separated kit name', () => {
    expect(resolve({ kitSpecifiers: [{ kitName: 'shared/deploy', checklists: [] }] })).toStrictEqual([
      { name: 'shared/deploy', source: { path: '.readyup/kits/shared/deploy.js' }, checklists: [] },
    ]);
  });

  it('applies --checklists to the named kit', () => {
    expect(
      resolve({ kitSpecifiers: [{ kitName: 'deploy', checklists: [] }], checklists: ['build', 'test'] }),
    ).toStrictEqual([{ name: 'deploy', source: { path: '.readyup/kits/deploy.js' }, checklists: ['build', 'test'] }]);
  });

  it('applies --checklists to the default kit when no kit is named', () => {
    expect(resolve({ checklists: ['build'] })).toStrictEqual([
      { name: 'default', source: { path: '.readyup/kits/default.js' }, checklists: ['build'] },
    ]);
  });

  // -- --jit flag --

  it('resolves to .ts with --jit', () => {
    expect(resolve({ jit: true })).toStrictEqual([
      { name: 'default', source: { path: '.readyup/kits/default.ts' }, checklists: [] },
    ]);
  });

  // -- --internal flag --

  it('applies internal dir with --internal', () => {
    expect(resolve({ internal: true, internalDir: 'internal' })).toStrictEqual([
      { name: 'default', source: { path: '.readyup/kits/internal/default.js' }, checklists: [] },
    ]);
  });

  it('applies internal dir and infix with --internal', () => {
    expect(resolve({ internal: true, internalDir: 'internal', internalInfix: 'int' })).toStrictEqual([
      { name: 'default', source: { path: '.readyup/kits/internal/default.int.js' }, checklists: [] },
    ]);
  });

  it('combines --jit and --internal', () => {
    expect(resolve({ jit: true, internal: true, internalDir: 'internal', internalInfix: 'int' })).toStrictEqual([
      { name: 'default', source: { path: '.readyup/kits/internal/default.int.ts' }, checklists: [] },
    ]);
  });

  it('falls back to the conventional kit directory when --internal names none', () => {
    expect(resolve({ internal: true, internalDir: undefined })).toStrictEqual([
      { name: 'default', source: { path: '.readyup/kits/default.js' }, checklists: [] },
    ]);
  });

  it('applies internal dir with named kit', () => {
    expect(
      resolve({
        kitSpecifiers: [{ kitName: 'deploy', checklists: [] }],
        internal: true,
        internalDir: 'internal',
        internalInfix: 'int',
      }),
    ).toStrictEqual([{ name: 'deploy', source: { path: '.readyup/kits/internal/deploy.int.js' }, checklists: [] }]);
  });

  // -- --file flag --

  it('resolves --file to a single path source entry', () => {
    expect(resolve({ filePath: 'custom/path.ts' })).toStrictEqual([
      {
        name: 'path',
        source: { path: 'custom/path.ts' },
        checklists: [],
        provenance: { kind: 'directory', label: 'custom' },
      },
    ]);
  });

  it('resolves --file with --checklists', () => {
    expect(resolve({ filePath: 'custom/path.ts', checklists: ['c1', 'c2'] })).toStrictEqual([
      {
        name: 'path',
        source: { path: 'custom/path.ts' },
        checklists: ['c1', 'c2'],
        provenance: { kind: 'directory', label: 'custom' },
      },
    ]);
  });

  it('resolves --file without internalDir/internalInfix', () => {
    expect(
      resolveKitSources({
        filePath: 'custom/path.ts',
        fromValue: undefined,
        urlValue: undefined,
        kitSpecifiers: [],
        checklists: undefined,
        jit: false,
        internal: false,
      }),
    ).toStrictEqual([
      {
        name: 'path',
        source: { path: 'custom/path.ts' },
        checklists: [],
        provenance: { kind: 'directory', label: 'custom' },
      },
    ]);
  });

  // -- --url flag --

  it('resolves --url to a URL source', () => {
    expect(resolve({ urlValue: 'https://example.com/config.js' })).toStrictEqual([
      {
        name: 'config',
        source: { url: 'https://example.com/config.js' },
        checklists: [],
        provenance: { kind: 'remote', label: 'example.com/config.js' },
      },
    ]);
  });

  it('resolves --url with --checklists', () => {
    expect(resolve({ urlValue: 'https://example.com/config.js', checklists: ['c1', 'c2'] })).toStrictEqual([
      {
        name: 'config',
        source: { url: 'https://example.com/config.js' },
        checklists: ['c1', 'c2'],
        provenance: { kind: 'remote', label: 'example.com/config.js' },
      },
    ]);
  });

  it('resolves --url without internalDir/internalInfix', () => {
    expect(
      resolveKitSources({
        filePath: undefined,
        fromValue: undefined,
        urlValue: 'https://example.com/kit.js',
        kitSpecifiers: [],
        checklists: undefined,
        jit: false,
        internal: false,
      }),
    ).toStrictEqual([
      {
        name: 'kit',
        source: { url: 'https://example.com/kit.js' },
        checklists: [],
        provenance: { kind: 'remote', label: 'example.com/kit.js' },
      },
    ]);
  });

  it('names an unparseable --url value exactly as given', () => {
    expect(resolve({ urlValue: 'not a url' })).toStrictEqual([
      {
        name: 'not a url',
        source: { url: 'not a url' },
        checklists: [],
        provenance: { kind: 'remote', label: 'not a url' },
      },
    ]);
  });

  // -- --from flag --

  it('resolves --from without internalDir/internalInfix', () => {
    expect(
      resolveKitSources({
        filePath: undefined,
        fromValue: 'github:org/repo',
        urlValue: undefined,
        kitSpecifiers: [{ kitName: 'deploy', checklists: [] }],
        checklists: undefined,
        jit: false,
        internal: false,
      }),
    ).toStrictEqual([
      {
        name: 'deploy',
        source: { url: 'https://raw.githubusercontent.com/org/repo/main/.readyup/kits/deploy.js' },
        checklists: [],
        provenance: { kind: 'remote', label: 'github:org/repo@main' },
      },
    ]);
  });

  it('defaults the --from kit to "default"', () => {
    expect(resolve({ fromValue: 'github:org/repo' })).toStrictEqual([
      {
        name: 'default',
        source: { url: 'https://raw.githubusercontent.com/org/repo/main/.readyup/kits/default.js' },
        checklists: [],
        provenance: { kind: 'remote', label: 'github:org/repo@main' },
      },
    ]);
  });

  it('reports a --from value that does not parse as a usage error', async () => {
    const error = await captureError(RdyError, () => {
      resolve({ fromValue: 'https://example.com/kit.js' });
      return 0;
    });

    expect(error.code).toBe('usage');
    expect(error.message).toMatch(/URLs are not accepted by --from/);
  });

  // -- --packages flag --

  // The flag names a config key, so reaching here with no key read is the same case as an empty one.
  it('reports --packages against a config that declares no packages as a usage error', async () => {
    const error = await captureError(RdyError, () => {
      resolve({ packages: true });
      return 0;
    });

    expect(error.code).toBe('usage');
    expect(error.message).toMatch(/requires a "packages" list/);
  });

  // -- Isolation of internal config with source flags --

  it('ignores internal config when --file is used', () => {
    expect(
      resolve({ filePath: 'custom/path.ts', internal: true, internalDir: 'internal', internalInfix: 'int' }),
    ).toStrictEqual([
      {
        name: 'path',
        source: { path: 'custom/path.ts' },
        checklists: [],
        provenance: { kind: 'directory', label: 'custom' },
      },
    ]);
  });

  it('ignores internal config when --from is used', () => {
    expect(
      resolve({ fromValue: 'github:org/repo', internal: false, internalDir: 'internal', internalInfix: 'int' }),
    ).toStrictEqual([
      {
        name: 'default',
        source: { url: 'https://raw.githubusercontent.com/org/repo/main/.readyup/kits/default.js' },
        checklists: [],
        provenance: { kind: 'remote', label: 'github:org/repo@main' },
      },
    ]);
  });

  it('ignores internal config when --url is used', () => {
    expect(
      resolve({
        urlValue: 'https://example.com/config.js',
        internal: true,
        internalDir: 'internal',
        internalInfix: 'int',
      }),
    ).toStrictEqual([
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
    ...overrides,
  });
}

// endregion | Helpers
