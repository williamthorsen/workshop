import path from 'node:path';
import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RdyManifestKit } from '../../manifest/manifestSchema.ts';
import { ManifestNotFoundError } from '../../manifest/readManifest.ts';

const mockReadManifest = vi.hoisted(() => vi.fn());
const mockCheckDrift = vi.hoisted(() => vi.fn());
const mockCheckInputDrift = vi.hoisted(() => vi.fn());
const mockCheckSourceDrift = vi.hoisted(() => vi.fn());

vi.mock(import('../../manifest/readManifest.ts'), async (importOriginal) => ({
  ...(await importOriginal()),
  readManifest: mockReadManifest,
}));

vi.mock(import('../../verify/checkDrift.ts'), () => ({
  checkDrift: mockCheckDrift,
}));

vi.mock(import('../../verify/checkInputDrift.ts'), () => ({
  checkInputDrift: mockCheckInputDrift,
}));

vi.mock(import('../../verify/checkSourceDrift.ts'), () => ({
  checkSourceDrift: mockCheckSourceDrift,
}));

import { listKitStalenessWarnings, type ManifestTracking, readManifestTracking } from '../kit-staleness.ts';

/** The compiled path of the kit on which these tests advise, as `resolveKitSources` would produce it. */
const KIT_PATH = '.readyup/kits/default.js';

/** The same file as the manifest records it: relative to `.readyup`, where the manifest lives. */
const MANIFEST_KIT_PATH = 'kits/default.js';

describe(readManifestTracking, () => {
  afterEach(() => {
    mockReadManifest.mockReset();
  });

  it('returns the manifest and the directory containing it', () => {
    const manifest = { version: 1, kits: [] };
    mockReadManifest.mockReturnValue(manifest);

    expect(readManifestTracking(false)).toStrictEqual({
      tracking: { manifest, manifestDir: path.resolve(process.cwd(), '.readyup') },
      warnings: [],
    });
  });

  it('skips the read under --jit, which runs from source that the manifest does not describe', () => {
    expect(readManifestTracking(true)).toStrictEqual({ tracking: undefined, warnings: [] });
    expect(mockReadManifest).not.toHaveBeenCalled();
  });

  it('stays silent when no manifest exists, which is the normal state of a project that never compiled', () => {
    mockReadManifest.mockImplementation(() => {
      throw new ManifestNotFoundError('/abs/.readyup/manifest.json');
    });

    expect(readManifestTracking(false)).toStrictEqual({ tracking: undefined, warnings: [] });
  });

  it('raises manifest-unreadable when the manifest is present and cannot be parsed', () => {
    mockReadManifest.mockImplementation(() => {
      throw new Error('Manifest file contains invalid JSON: /abs/.readyup/manifest.json');
    });

    const result = readManifestTracking(false);

    expect(result.tracking).toBeUndefined();
    expect(result.warnings).toStrictEqual([
      {
        code: 'manifest-unreadable',
        message: expect.stringContaining('could not be read, so no kit was checked against it'),
        remedy: 'Run `rdy compile` to rewrite it.',
      },
    ]);
  });

  it('names the parse failure in the advisory to say why the run stopped checking', () => {
    mockReadManifest.mockImplementation(() => {
      throw new Error('Invalid manifest schema in /abs/.readyup/manifest.json: targetHash must be a hash');
    });

    expect(readManifestTracking(false).warnings[0]?.message).toContain('targetHash must be a hash');
  });
});

describe(listKitStalenessWarnings, () => {
  beforeEach(() => {
    mockCheckDrift.mockReturnValue({ kind: 'ok', targetHash: 'aaaa1111' });
    mockCheckInputDrift.mockReturnValue({ kind: 'ok' });
    mockCheckSourceDrift.mockReturnValue({ kind: 'ok', sourceHash: '5555bbbb' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockCheckDrift.mockReset();
    mockCheckInputDrift.mockReset();
    mockCheckSourceDrift.mockReset();
  });

  describe('advisories', () => {
    it('advises recompiling when the compiled bundle no longer matches the manifest', () => {
      arrangeTargetDrift();

      expect(listKitStalenessWarnings('default', { path: KIT_PATH }, defaultTracking())).toStrictEqual([
        {
          code: 'target-drift',
          message: 'compiled kit "default" does not match the hash that the manifest recorded for it.',
          remedy: 'Move the edits into the source, then run `rdy compile --force`.',
        },
      ]);
    });

    it('advises recompiling when the source has moved on since the kit was compiled', () => {
      arrangeSourceStale();

      expect(listKitStalenessWarnings('default', { path: KIT_PATH }, defaultTracking())).toStrictEqual([
        {
          code: 'source-stale',
          message: 'kit "default" was compiled from an older source than the one on disk.',
          remedy: 'Run `rdy compile` to rebuild it.',
        },
      ]);
    });

    it('advises recompiling when a file inlined by the compile has changed', () => {
      arrangeInputStale();

      expect(listKitStalenessWarnings('default', { path: KIT_PATH }, defaultTracking())).toStrictEqual([
        {
          code: 'input-stale',
          message: 'kit "default" inlined files that no longer match the ones on disk.',
          remedy: 'Run `rdy compile` to rebuild it.',
        },
      ]);
    });

    it('advises on a changed input alongside one that is merely gone', () => {
      mockCheckInputDrift.mockReturnValue({
        kind: 'stale',
        failures: [
          { kind: 'module', path: 'kits/gone.ts', reason: 'missing' },
          { kind: 'module', path: 'kits/shared.ts', reason: 'changed', expected: '7777dddd', actual: '8888eeee' },
        ],
      });

      expect(
        listKitStalenessWarnings('default', { path: KIT_PATH }, defaultTracking()).map((w) => w.code),
      ).toStrictEqual(['input-stale']);
    });

    it('raises all three advisories when every axis differs from the manifest', () => {
      arrangeTargetDrift();
      arrangeSourceStale();
      arrangeInputStale();

      expect(
        listKitStalenessWarnings('default', { path: KIT_PATH }, defaultTracking()).map((w) => w.code),
      ).toStrictEqual(['target-drift', 'source-stale', 'input-stale']);
    });

    it('raises both advisories when both artifacts differ from the manifest', () => {
      arrangeTargetDrift();
      arrangeSourceStale();

      expect(
        listKitStalenessWarnings('default', { path: KIT_PATH }, defaultTracking()).map((w) => w.code),
      ).toStrictEqual(['target-drift', 'source-stale']);
    });

    it('names the kit for which it was called, not the entry that it matched', () => {
      arrangeTargetDrift();

      const warnings = listKitStalenessWarnings('alpha', { path: KIT_PATH }, defaultTracking());

      expect(warnings[0]?.message).toContain('compiled kit "alpha"');
    });

    it('still advises on the target when the source cannot be hashed', () => {
      arrangeTargetDrift();
      mockCheckSourceDrift.mockImplementation(() => {
        throw new Error('EACCES: permission denied, open /abs/default.ts');
      });

      expect(
        listKitStalenessWarnings('default', { path: KIT_PATH }, defaultTracking()).map((w) => w.code),
      ).toStrictEqual(['target-drift']);
    });

    it('still advises on the source when the compiled bundle cannot be hashed', () => {
      arrangeSourceStale();
      mockCheckDrift.mockImplementation(() => {
        throw new Error('EACCES: permission denied, open /abs/default.js');
      });

      expect(
        listKitStalenessWarnings('default', { path: KIT_PATH }, defaultTracking()).map((w) => w.code),
      ).toStrictEqual(['source-stale']);
    });
  });

  describe('silence', () => {
    it('stays silent when the run read no manifest', () => {
      arrangeTargetDrift();

      expect(listKitStalenessWarnings('default', { path: KIT_PATH }, undefined)).toStrictEqual([]);
      expect(mockCheckDrift).not.toHaveBeenCalled();
    });

    it('stays silent for a remote kit, which no local manifest describes', () => {
      arrangeTargetDrift();

      expect(
        listKitStalenessWarnings('deploy', { url: 'https://example.com/kits/deploy.js' }, defaultTracking()),
      ).toStrictEqual([]);
      expect(mockCheckDrift).not.toHaveBeenCalled();
    });

    it('stays silent when no manifest entry describes the kit', () => {
      arrangeTargetDrift();
      const tracking = trackingFor([{ name: 'other', path: 'kits/other.js', source: 'kits/other.ts' }]);

      expect(listKitStalenessWarnings('default', { path: KIT_PATH }, tracking)).toStrictEqual([]);
      expect(mockCheckDrift).not.toHaveBeenCalled();
    });

    // A `--from` source resolves under another root, whose manifest this run never reads.
    it('stays silent for a kit resolved outside the working directory', () => {
      arrangeTargetDrift();

      expect(
        listKitStalenessWarnings('default', { path: '/elsewhere/.readyup/kits/default.js' }, defaultTracking()),
      ).toStrictEqual([]);
      expect(mockCheckDrift).not.toHaveBeenCalled();
    });

    it('stays silent for an entry that records no path to match on', () => {
      arrangeTargetDrift();
      const tracking = trackingFor([{ name: 'default', source: 'kits/default.ts' }]);

      expect(listKitStalenessWarnings('default', { path: KIT_PATH }, tracking)).toStrictEqual([]);
    });

    it('stays silent when both artifacts match the manifest', () => {
      const warnings = listKitStalenessWarnings('default', { path: KIT_PATH }, defaultTracking());

      expect(warnings).toStrictEqual([]);
    });

    it('stays silent when an input read by the compile is gone, as it is for a deleted source', () => {
      mockCheckInputDrift.mockReturnValue({
        kind: 'stale',
        failures: [{ kind: 'module', path: 'kits/shared.ts', reason: 'missing' }],
      });

      expect(listKitStalenessWarnings('default', { path: KIT_PATH }, defaultTracking())).toStrictEqual([]);
    });

    it('stays silent for a projection that it can no longer reproduce', () => {
      mockCheckInputDrift.mockReturnValue({
        kind: 'stale',
        failures: [
          {
            kind: 'inline',
            path: '../../package.json',
            reason: 'unprojectable',
            detail: 'path not found: version',
          },
        ],
      });

      expect(listKitStalenessWarnings('default', { path: KIT_PATH }, defaultTracking())).toStrictEqual([]);
    });

    it('stays silent for an entry that predates the recorded closure', () => {
      mockCheckInputDrift.mockReturnValue({ kind: 'unverified' });

      expect(listKitStalenessWarnings('default', { path: KIT_PATH }, defaultTracking())).toStrictEqual([]);
    });

    it('stays silent when the manifest entry records no hashes to compare', () => {
      mockCheckDrift.mockReturnValue({ kind: 'unverified' });
      mockCheckInputDrift.mockReturnValue({ kind: 'unverified' });
      mockCheckSourceDrift.mockReturnValue({ kind: 'unverified' });

      expect(listKitStalenessWarnings('default', { path: KIT_PATH }, defaultTracking())).toStrictEqual([]);
    });

    it('stays silent when a file named by the manifest is gone', () => {
      mockCheckDrift.mockReturnValue({ kind: 'missing', resolvedPath: '/abs/default.js' });
      mockCheckSourceDrift.mockReturnValue({ kind: 'missing', resolvedPath: '/abs/default.ts' });

      expect(listKitStalenessWarnings('default', { path: KIT_PATH }, defaultTracking())).toStrictEqual([]);
    });

    it('stays silent when no file that it would compare can be read', () => {
      mockCheckDrift.mockImplementation(() => {
        throw new Error('EACCES: permission denied, open /abs/default.js');
      });
      mockCheckInputDrift.mockImplementation(() => {
        throw new Error('EACCES: permission denied, open /abs/shared.ts');
      });
      mockCheckSourceDrift.mockImplementation(() => {
        throw new Error('EACCES: permission denied, open /abs/default.ts');
      });

      expect(listKitStalenessWarnings('default', { path: KIT_PATH }, defaultTracking())).toStrictEqual([]);
    });
  });

  // region | Helpers

  /** Reports a file inlined by the compile as edited without a recompile. */
  function arrangeInputStale(): void {
    mockCheckInputDrift.mockReturnValue({
      kind: 'stale',
      failures: [
        { kind: 'module', path: 'kits/shared.ts', reason: 'changed', expected: '7777dddd', actual: '8888eeee' },
      ],
    });
  }

  /** Reports the source as edited without a recompile. */
  function arrangeSourceStale(): void {
    mockCheckSourceDrift.mockReturnValue({
      kind: 'stale',
      expected: '5555bbbb',
      actual: '6666cccc',
      resolvedPath: '/abs/default.ts',
    });
  }

  /** Reports the compiled bundle as edited by hand. */
  function arrangeTargetDrift(): void {
    mockCheckDrift.mockReturnValue({
      kind: 'drift',
      expected: 'aaaa1111',
      actual: 'aaaa9999',
      resolvedPath: '/abs/default.js',
    });
  }

  /** Returns tracking whose sole entry describes the kit at `KIT_PATH`. */
  function defaultTracking(): ManifestTracking {
    return trackingFor([{ name: 'default', path: MANIFEST_KIT_PATH, source: 'kits/default.ts' }]);
  }

  /** Returns tracking as `readManifestTracking` would have built it, containing the given entries. */
  function trackingFor(kits: RdyManifestKit[]): ManifestTracking {
    return { manifest: { version: 1, kits }, manifestDir: path.resolve(process.cwd(), '.readyup') };
  }

  // endregion | Helpers
});
