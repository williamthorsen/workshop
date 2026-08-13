import path from 'node:path';
import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import type { RdyManifestKit } from '../../manifest/manifestSchema.ts';

const mockReadManifest = vi.hoisted(() => vi.fn());
const mockCheckDrift = vi.hoisted(() => vi.fn());
const mockCheckInputDrift = vi.hoisted(() => vi.fn());
const mockCheckSourceDrift = vi.hoisted(() => vi.fn());

vi.mock(import('../../manifest/readManifest.ts'), () => ({
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

import { type ManifestTracking, readManifestTracking, warnOnKitStaleness } from '../kit-staleness.ts';

/** The compiled path of the kit these tests advise on, as `resolveKitSources` would produce it. */
const KIT_PATH = '.readyup/kits/default.js';

/** The same file as the manifest records it: relative to `.readyup`, where the manifest lives. */
const MANIFEST_KIT_PATH = 'kits/default.js';

describe(readManifestTracking, () => {
  afterEach(() => {
    mockReadManifest.mockReset();
  });

  it('answers with the manifest and the directory holding it', () => {
    const manifest = { version: 1, kits: [] };
    mockReadManifest.mockReturnValue(manifest);

    expect(readManifestTracking(false)).toStrictEqual({
      manifest,
      manifestDir: path.resolve(process.cwd(), '.readyup'),
    });
  });

  it('skips the read under --jit, which runs from source the manifest does not describe', () => {
    expect(readManifestTracking(true)).toBeUndefined();
    expect(mockReadManifest).not.toHaveBeenCalled();
  });

  it('answers with nothing when no manifest exists', () => {
    mockReadManifest.mockImplementation(() => {
      throw new Error('Manifest file not found: /abs/.readyup/manifest.json');
    });

    expect(readManifestTracking(false)).toBeUndefined();
  });

  it('answers with nothing when the manifest cannot be parsed', () => {
    mockReadManifest.mockImplementation(() => {
      throw new Error('Manifest file contains invalid JSON: /abs/.readyup/manifest.json');
    });

    expect(readManifestTracking(false)).toBeUndefined();
  });
});

describe(warnOnKitStaleness, () => {
  let stderrSpy: MockInstance;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
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

      expect(warnOnKitStaleness('default', { path: KIT_PATH }, defaultTracking())).toStrictEqual([
        {
          code: 'target-drift',
          message: 'compiled kit "default" does not match the hash the manifest recorded for it.',
          remedy: 'Run `rdy compile --force` to rebuild it from source.',
        },
      ]);
    });

    it('advises recompiling when the source has moved on since the kit was compiled', () => {
      arrangeSourceStale();

      expect(warnOnKitStaleness('default', { path: KIT_PATH }, defaultTracking())).toStrictEqual([
        {
          code: 'source-stale',
          message: 'kit "default" was compiled from an older source than the one on disk.',
          remedy: 'Run `rdy compile` to rebuild it.',
        },
      ]);
    });

    it('advises recompiling when a file the compile inlined has changed', () => {
      arrangeInputStale();

      expect(warnOnKitStaleness('default', { path: KIT_PATH }, defaultTracking())).toStrictEqual([
        {
          code: 'input-stale',
          message: 'kit "default" inlined files that no longer match the ones on disk.',
          remedy: 'Run `rdy compile` to rebuild it.',
        },
      ]);
    });

    it('advises on a changed input sitting beside one that is merely gone', () => {
      mockCheckInputDrift.mockReturnValue({
        kind: 'stale',
        failures: [
          { kind: 'module', path: 'kits/gone.ts', reason: 'missing' },
          { kind: 'module', path: 'kits/shared.ts', reason: 'changed', expected: '7777dddd', actual: '8888eeee' },
        ],
      });

      expect(warnOnKitStaleness('default', { path: KIT_PATH }, defaultTracking()).map((w) => w.code)).toStrictEqual([
        'input-stale',
      ]);
    });

    it('raises all three advisories when every axis has parted from the manifest', () => {
      arrangeTargetDrift();
      arrangeSourceStale();
      arrangeInputStale();

      expect(warnOnKitStaleness('default', { path: KIT_PATH }, defaultTracking()).map((w) => w.code)).toStrictEqual([
        'target-drift',
        'source-stale',
        'input-stale',
      ]);
    });

    it('raises both advisories when both artifacts have parted from the manifest', () => {
      arrangeTargetDrift();
      arrangeSourceStale();

      expect(warnOnKitStaleness('default', { path: KIT_PATH }, defaultTracking()).map((w) => w.code)).toStrictEqual([
        'target-drift',
        'source-stale',
      ]);
    });

    it('writes each advisory to stderr with the remedy beside it', () => {
      arrangeTargetDrift();

      warnOnKitStaleness('default', { path: KIT_PATH }, defaultTracking());

      expect(stderrText()).toBe(
        'Warning: compiled kit "default" does not match the hash the manifest recorded for it. ' +
          'Run `rdy compile --force` to rebuild it from source.\n',
      );
    });

    it('names the kit it was called for, not the entry it matched', () => {
      arrangeTargetDrift();

      const warnings = warnOnKitStaleness('alpha', { path: KIT_PATH }, defaultTracking());

      expect(warnings[0]?.message).toContain('compiled kit "alpha"');
    });

    it('still advises on the target when the source cannot be hashed', () => {
      arrangeTargetDrift();
      mockCheckSourceDrift.mockImplementation(() => {
        throw new Error('EACCES: permission denied, open /abs/default.ts');
      });

      expect(warnOnKitStaleness('default', { path: KIT_PATH }, defaultTracking()).map((w) => w.code)).toStrictEqual([
        'target-drift',
      ]);
    });

    it('still advises on the source when the compiled bundle cannot be hashed', () => {
      arrangeSourceStale();
      mockCheckDrift.mockImplementation(() => {
        throw new Error('EACCES: permission denied, open /abs/default.js');
      });

      expect(warnOnKitStaleness('default', { path: KIT_PATH }, defaultTracking()).map((w) => w.code)).toStrictEqual([
        'source-stale',
      ]);
    });
  });

  describe('silence', () => {
    it('stays silent when the run read no manifest', () => {
      arrangeTargetDrift();

      expect(warnOnKitStaleness('default', { path: KIT_PATH }, undefined)).toStrictEqual([]);
      expect(mockCheckDrift).not.toHaveBeenCalled();
    });

    it('stays silent for a remote kit, which no local manifest describes', () => {
      arrangeTargetDrift();

      expect(
        warnOnKitStaleness('deploy', { url: 'https://example.com/kits/deploy.js' }, defaultTracking()),
      ).toStrictEqual([]);
      expect(mockCheckDrift).not.toHaveBeenCalled();
    });

    it('stays silent when no manifest entry describes the kit', () => {
      arrangeTargetDrift();
      const tracking = trackingFor([{ name: 'other', path: 'kits/other.js', source: 'kits/other.ts' }]);

      expect(warnOnKitStaleness('default', { path: KIT_PATH }, tracking)).toStrictEqual([]);
      expect(mockCheckDrift).not.toHaveBeenCalled();
    });

    // A `--from` source resolves under another root, whose manifest this run never reads.
    it('stays silent for a kit resolved outside the working directory', () => {
      arrangeTargetDrift();

      expect(
        warnOnKitStaleness('default', { path: '/elsewhere/.readyup/kits/default.js' }, defaultTracking()),
      ).toStrictEqual([]);
      expect(mockCheckDrift).not.toHaveBeenCalled();
    });

    it('stays silent for an entry that records no path to match on', () => {
      arrangeTargetDrift();
      const tracking = trackingFor([{ name: 'default', source: 'kits/default.ts' }]);

      expect(warnOnKitStaleness('default', { path: KIT_PATH }, tracking)).toStrictEqual([]);
    });

    it('stays silent when both artifacts match the manifest', () => {
      expect(warnOnKitStaleness('default', { path: KIT_PATH }, defaultTracking())).toStrictEqual([]);
      expect(stderrText()).toBe('');
    });

    it('stays silent for an input the compile read that is gone, as it is for a deleted source', () => {
      mockCheckInputDrift.mockReturnValue({
        kind: 'stale',
        failures: [{ kind: 'module', path: 'kits/shared.ts', reason: 'missing' }],
      });

      expect(warnOnKitStaleness('default', { path: KIT_PATH }, defaultTracking())).toStrictEqual([]);
    });

    it('stays silent for a projection it can no longer reproduce', () => {
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

      expect(warnOnKitStaleness('default', { path: KIT_PATH }, defaultTracking())).toStrictEqual([]);
    });

    it('stays silent for an entry that predates the recorded closure', () => {
      mockCheckInputDrift.mockReturnValue({ kind: 'unverified' });

      expect(warnOnKitStaleness('default', { path: KIT_PATH }, defaultTracking())).toStrictEqual([]);
    });

    it('stays silent when the manifest entry records no hashes to compare', () => {
      mockCheckDrift.mockReturnValue({ kind: 'unverified' });
      mockCheckInputDrift.mockReturnValue({ kind: 'unverified' });
      mockCheckSourceDrift.mockReturnValue({ kind: 'unverified' });

      expect(warnOnKitStaleness('default', { path: KIT_PATH }, defaultTracking())).toStrictEqual([]);
    });

    it('stays silent when a file the manifest names is gone', () => {
      mockCheckDrift.mockReturnValue({ kind: 'missing', resolvedPath: '/abs/default.js' });
      mockCheckSourceDrift.mockReturnValue({ kind: 'missing', resolvedPath: '/abs/default.ts' });

      expect(warnOnKitStaleness('default', { path: KIT_PATH }, defaultTracking())).toStrictEqual([]);
    });

    it('stays silent when no file it would compare can be read', () => {
      mockCheckDrift.mockImplementation(() => {
        throw new Error('EACCES: permission denied, open /abs/default.js');
      });
      mockCheckInputDrift.mockImplementation(() => {
        throw new Error('EACCES: permission denied, open /abs/shared.ts');
      });
      mockCheckSourceDrift.mockImplementation(() => {
        throw new Error('EACCES: permission denied, open /abs/default.ts');
      });

      expect(warnOnKitStaleness('default', { path: KIT_PATH }, defaultTracking())).toStrictEqual([]);
    });
  });

  // region | Helpers

  /** Reports a file the compile inlined as edited without a recompile. */
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

  /** Tracking whose sole entry describes the kit at `KIT_PATH`. */
  function defaultTracking(): ManifestTracking {
    return trackingFor([{ name: 'default', path: MANIFEST_KIT_PATH, source: 'kits/default.ts' }]);
  }

  /** Every stderr write concatenated into one string. */
  function stderrText(): string {
    return stderrSpy.mock.calls.map((call) => String(call[0])).join('');
  }

  /** Tracking as `readManifestTracking` would have built it, holding the given entries. */
  function trackingFor(kits: RdyManifestKit[]): ManifestTracking {
    return { manifest: { version: 1, kits }, manifestDir: path.resolve(process.cwd(), '.readyup') };
  }

  // endregion | Helpers
});
