import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockLoadConfig = vi.hoisted(() => vi.fn());
const mockCollectSourceKitNames = vi.hoisted(() => vi.fn());
const mockReadManifest = vi.hoisted(() => vi.fn());
const mockExpandConfiguredSource = vi.hoisted(() => vi.fn());
const mockDiscoverKitPackages = vi.hoisted(() => vi.fn());

vi.mock(import('../../sources/expandConfiguredSources.ts'), () => ({
  expandConfiguredSource: mockExpandConfiguredSource,
  expandConfiguredSources: vi.fn(),
}));

vi.mock(import('../../check-utils/discoverKitPackages.ts'), () => ({
  discoverKitPackages: mockDiscoverKitPackages,
}));

vi.mock(import('../../config/loadConfig.ts'), async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config/loadConfig.ts')>();
  return { DEFAULT_CONFIG: actual.DEFAULT_CONFIG, loadConfig: mockLoadConfig };
});

vi.mock(import('../enumerateKits.ts'), () => ({
  enumerateKits: vi.fn(() => []),
}));

vi.mock(import('../../compile/collectSourceKitNames.ts'), () => ({
  collectSourceKitNames: mockCollectSourceKitNames,
}));

vi.mock(import('../../manifest/readManifest.ts'), async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../manifest/readManifest.ts')>();
  return { ManifestNotFoundError: actual.ManifestNotFoundError, readManifest: mockReadManifest };
});

import type { ReportedWarning } from '../../output/writeWarnings.ts';
import { createRemoteFetchContext } from '../../remote/createRemoteFetchContext.ts';
import { parseConfiguredSource } from '../../sources/parseConfiguredSource.ts';
import { runOwnerMode } from '../runOwnerMode.ts';

describe(runOwnerMode, () => {
  beforeEach(() => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined, exclude: [] },
      internal: { dir: '.', infix: undefined },
      omittedSources: [],
      sources: [],
    });
    mockCollectSourceKitNames.mockReturnValue(['default']);
    mockReadManifest.mockReturnValue({ version: 1, kits: [] });
    mockExpandConfiguredSource.mockResolvedValue([]);
    mockDiscoverKitPackages.mockReturnValue(['@acme/kits']);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockLoadConfig.mockReset();
    mockCollectSourceKitNames.mockReset();
    mockReadManifest.mockReset();
    mockExpandConfiguredSource.mockReset();
    mockDiscoverKitPackages.mockReset();
  });

  it('returns the view, the rows, and the unconfigured kit packages, and writes nothing', async () => {
    using io = captureStdio();
    const warnings: ReportedWarning[] = [];

    const result = await runOwnerMode(false, undefined, createRemoteFetchContext({ shouldReload: false }), warnings);

    expect(result.view).toContain('default');
    expect(result.kits.map(({ name, kind }) => `${kind}:${name}`)).toStrictEqual(['internal:default']);
    expect(result.availableSources).toStrictEqual(['npm:@acme/kits']);
    expect(warnings).toStrictEqual([]);
    expect(io.stdout).toBe('');
    expect(io.stderr).toBe('');
  });

  it('adds the warning of a config that cannot be loaded, with its hint as the remedy', async () => {
    using io = captureStdio();
    mockLoadConfig.mockRejectedValue(
      Object.assign(new Error('bad config.'), { hint: 'Install it with: pnpm add --save-dev some-lib' }),
    );
    const warnings: ReportedWarning[] = [];

    await runOwnerMode(false, undefined, createRemoteFetchContext({ shouldReload: false }), warnings);

    expect(warnings).toStrictEqual([
      {
        message: 'bad config. Listing with default settings.',
        remedy: 'Install it with: pnpm add --save-dev some-lib',
      },
    ]);
    expect(io.stderr).toBe('');
  });

  it('adds the warnings of an unreadable manifest and an unexpandable source, in that order', async () => {
    using io = captureStdio();
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined, exclude: [] },
      internal: { dir: '.', infix: undefined },
      omittedSources: [],
      sources: [parseConfiguredSource('npm:broken')],
    });
    mockReadManifest.mockImplementation(() => {
      throw new Error('Manifest file contains invalid JSON: .readyup/manifest.json');
    });
    mockExpandConfiguredSource.mockRejectedValue(new Error('Configured source "npm:broken" was not found.'));
    const warnings: ReportedWarning[] = [];

    await runOwnerMode(false, undefined, createRemoteFetchContext({ shouldReload: false }), warnings);

    expect(warnings).toStrictEqual([
      { message: 'Manifest file contains invalid JSON: .readyup/manifest.json' },
      { message: 'Configured source "npm:broken" was not found.' },
    ]);
    expect(io.stderr).toBe('');
  });
});
