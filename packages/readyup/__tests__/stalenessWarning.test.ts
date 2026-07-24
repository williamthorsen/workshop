import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import type { RdyManifestKit } from '../src/manifest/manifestSchema.ts';
import type { JsonWarning } from '../src/schemas/index.ts';
import type { RdyKit } from '../src/types.ts';

const mockLoadRdyKit = vi.hoisted(() => vi.fn());
const mockLoadRemoteKit = vi.hoisted(() => vi.fn());
const mockRunRdy = vi.hoisted(() => vi.fn());
const mockReportRdy = vi.hoisted(() => vi.fn());
const mockFormatCombinedSummary = vi.hoisted(() => vi.fn());
// Typed against the real signature so the captured call exposes `warnings` without an assertion.
const mockFormatJsonReport = vi.hoisted(() => vi.fn<typeof import('../src/formatJsonReport.ts').formatJsonReport>());
const mockReadManifest = vi.hoisted(() => vi.fn());
const mockCheckDrift = vi.hoisted(() => vi.fn());
const mockCheckSourceDrift = vi.hoisted(() => vi.fn());

vi.mock('../src/config.ts', () => ({
  loadRdyKit: mockLoadRdyKit,
}));

vi.mock('../src/loadRemoteKit.ts', () => ({
  loadRemoteKit: mockLoadRemoteKit,
}));

vi.mock('../src/runRdy.ts', () => ({
  meetsThreshold: () => true,
  runRdy: mockRunRdy,
}));

vi.mock('../src/reportRdy.ts', async () => {
  const actual = await vi.importActual<typeof import('../src/reportRdy.ts')>('../src/reportRdy.ts');
  return { ...actual, reportRdy: mockReportRdy };
});

vi.mock('../src/formatCombinedSummary.ts', () => ({
  formatCombinedSummary: mockFormatCombinedSummary,
}));

vi.mock('../src/formatJsonReport.ts', () => ({
  formatJsonReport: mockFormatJsonReport,
}));

vi.mock('../src/manifest/readManifest.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/manifest/readManifest.ts')>();
  return { ManifestNotFoundError: actual.ManifestNotFoundError, readManifest: mockReadManifest };
});

vi.mock('../src/verify/checkDrift.ts', () => ({
  checkDrift: mockCheckDrift,
}));

vi.mock('../src/verify/checkSourceDrift.ts', () => ({
  checkSourceDrift: mockCheckSourceDrift,
}));

import { runCommand } from '../src/cli.ts';

/** The compiled path of the kit every test here runs, as `resolveKitSources` would produce it. */
const KIT_PATH = '.readyup/kits/default.js';

/** The same file as the manifest records it: relative to `.readyup`, where the manifest lives. */
const MANIFEST_KIT_PATH = 'kits/default.js';

/** Build a minimal kit with one passing checklist. */
function makeKit(): RdyKit {
  return { checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }] };
}

/** Build a single-kit entry pointing at the compiled default kit. */
function singleKitEntry(name = 'default') {
  return [{ name, source: { path: KIT_PATH }, checklists: [] }];
}

/** Seed the manifest with the given entries. */
function arrangeManifest(kits: RdyManifestKit[]): void {
  mockReadManifest.mockReturnValue({ version: 1, kits });
}

describe('staleness warnings', () => {
  let stdoutSpy: MockInstance;
  let stderrSpy: MockInstance;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
    mockReportRdy.mockReturnValue('report output');
    mockFormatCombinedSummary.mockReturnValue('');
    mockFormatJsonReport.mockReturnValue('{}');
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
    mockCheckDrift.mockReturnValue({ kind: 'ok', targetHash: 'aaaa1111' });
    mockCheckSourceDrift.mockReturnValue({ kind: 'ok', sourceHash: '5555bbbb' });
    arrangeManifest([{ name: 'default', path: MANIFEST_KIT_PATH, source: 'kits/default.ts' }]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockLoadRdyKit.mockReset();
    mockLoadRemoteKit.mockReset();
    mockRunRdy.mockReset();
    mockReportRdy.mockReset();
    mockFormatCombinedSummary.mockReset();
    mockFormatJsonReport.mockReset();
    mockReadManifest.mockReset();
    mockCheckDrift.mockReset();
    mockCheckSourceDrift.mockReset();
  });

  /** Concatenate every stderr write into a single string for substring assertions. */
  function stderrText(): string {
    return stderrSpy.mock.calls.map((c) => String(c[0])).join('');
  }

  /** Concatenate every stdout write into a single string for substring assertions. */
  function stdoutText(): string {
    return stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
  }

  /** The warnings the JSON report was handed, or an empty array when it was handed none. */
  function reportedWarnings(): JsonWarning[] {
    const call = mockFormatJsonReport.mock.calls[0];
    return call?.[1].warnings ?? [];
  }

  /** Report the compiled bundle as edited by hand. */
  function arrangeTargetDrift(): void {
    mockCheckDrift.mockReturnValue({
      kind: 'drift',
      expected: 'aaaa1111',
      actual: 'aaaa9999',
      resolvedPath: '/abs/default.js',
    });
  }

  /** Report the source as edited without a recompile. */
  function arrangeSourceStale(): void {
    mockCheckSourceDrift.mockReturnValue({
      kind: 'stale',
      expected: '5555bbbb',
      actual: '6666cccc',
      resolvedPath: '/abs/default.ts',
    });
  }

  /** Report the source as present but impossible to hash. */
  function arrangeUnreadableSource(): void {
    mockCheckSourceDrift.mockImplementation(() => {
      throw new Error('EACCES: permission denied, open /abs/default.ts');
    });
  }

  describe('human mode', () => {
    it('warns when the compiled bundle no longer matches the manifest', async () => {
      arrangeTargetDrift();

      await runCommand({ kitEntries: singleKitEntry(), json: false });

      expect(stderrText()).toContain(
        'Warning: compiled kit "default" does not match the hash the manifest recorded for it. Run `rdy compile --force` to rebuild it from source.',
      );
    });

    it('warns when the source has moved on since the kit was compiled', async () => {
      arrangeSourceStale();

      await runCommand({ kitEntries: singleKitEntry(), json: false });

      expect(stderrText()).toContain(
        'Warning: kit "default" was compiled from an older source than the one on disk. Run `rdy compile` to rebuild it.',
      );
    });

    it('raises both advisories when both artifacts have parted from the manifest', async () => {
      arrangeTargetDrift();
      arrangeSourceStale();

      await runCommand({ kitEntries: singleKitEntry(), json: false });

      const stderr = stderrText();
      expect(stderr).toContain('does not match the hash the manifest recorded');
      expect(stderr).toContain('compiled from an older source');
    });

    it('leaves the exit code alone, since verify is the enforcing gate', async () => {
      arrangeTargetDrift();
      arrangeSourceStale();

      const exitCode = await runCommand({ kitEntries: singleKitEntry(), json: false });

      expect(exitCode).toBe(0);
    });

    it('still advises on the target when the source cannot be hashed', async () => {
      arrangeTargetDrift();
      arrangeUnreadableSource();

      await runCommand({ kitEntries: singleKitEntry(), json: false });

      const stderr = stderrText();
      expect(stderr).toContain('does not match the hash the manifest recorded');
      expect(stderr).not.toContain('compiled from an older source');
    });

    it('still advises on the source when the compiled bundle cannot be hashed', async () => {
      arrangeSourceStale();
      mockCheckDrift.mockImplementation(() => {
        throw new Error('EISDIR: illegal operation on a directory, read');
      });

      await runCommand({ kitEntries: singleKitEntry(), json: false });

      const stderr = stderrText();
      expect(stderr).toContain('compiled from an older source');
      expect(stderr).not.toContain('does not match the hash the manifest recorded');
    });

    it('stays silent when both artifacts match the manifest', async () => {
      await runCommand({ kitEntries: singleKitEntry(), json: false });

      expect(stderrText()).not.toContain('Warning:');
    });

    it('reads the manifest once per invocation, not once per kit', async () => {
      arrangeManifest([
        { name: 'alpha', path: 'kits/alpha.js', source: 'kits/alpha.ts' },
        { name: 'beta', path: 'kits/beta.js', source: 'kits/beta.ts' },
      ]);

      await runCommand({
        kitEntries: [
          { name: 'alpha', source: { path: '.readyup/kits/alpha.js' }, checklists: [] },
          { name: 'beta', source: { path: '.readyup/kits/beta.js' }, checklists: [] },
        ],
        json: false,
      });

      expect(mockReadManifest).toHaveBeenCalledTimes(1);
    });

    it('scopes each advisory to the kit whose entry earned it', async () => {
      arrangeManifest([
        { name: 'alpha', path: 'kits/alpha.js', source: 'kits/alpha.ts' },
        { name: 'beta', path: 'kits/beta.js', source: 'kits/beta.ts' },
      ]);
      mockCheckDrift
        .mockReturnValueOnce({ kind: 'drift', expected: 'a', actual: 'b', resolvedPath: '/abs/alpha.js' })
        .mockReturnValueOnce({ kind: 'ok', targetHash: 'bbbb' });

      await runCommand({
        kitEntries: [
          { name: 'alpha', source: { path: '.readyup/kits/alpha.js' }, checklists: [] },
          { name: 'beta', source: { path: '.readyup/kits/beta.js' }, checklists: [] },
        ],
        json: false,
      });

      const stderr = stderrText();
      expect(stderr).toContain('compiled kit "alpha"');
      expect(stderr).not.toContain('compiled kit "beta"');
    });
  });

  describe('silence', () => {
    it('stays silent when no manifest exists', async () => {
      arrangeTargetDrift();
      mockReadManifest.mockImplementation(() => {
        throw new Error('Manifest file not found: /abs/.readyup/manifest.json');
      });

      await runCommand({ kitEntries: singleKitEntry(), json: false });

      expect(stderrText()).not.toContain('Warning:');
    });

    it('stays silent when the manifest is unreadable', async () => {
      arrangeTargetDrift();
      mockReadManifest.mockImplementation(() => {
        throw new Error('Manifest file contains invalid JSON: /abs/.readyup/manifest.json');
      });

      await runCommand({ kitEntries: singleKitEntry(), json: false });

      expect(stderrText()).not.toContain('Warning:');
    });

    it('stays silent when no manifest entry describes the kit being run', async () => {
      arrangeTargetDrift();
      arrangeManifest([{ name: 'other', path: 'kits/other.js', source: 'kits/other.ts' }]);

      await runCommand({ kitEntries: singleKitEntry(), json: false });

      expect(stderrText()).not.toContain('Warning:');
      expect(mockCheckDrift).not.toHaveBeenCalled();
    });

    // A `--from` source resolves under another root, whose manifest this run never reads.
    it('stays silent for a kit resolved outside the working directory', async () => {
      arrangeTargetDrift();

      await runCommand({
        kitEntries: [{ name: 'default', source: { path: '/elsewhere/.readyup/kits/default.js' }, checklists: [] }],
        json: false,
      });

      expect(stderrText()).not.toContain('Warning:');
      expect(mockCheckDrift).not.toHaveBeenCalled();
    });

    it('stays silent for an entry that records no path to match on', async () => {
      arrangeTargetDrift();
      arrangeManifest([{ name: 'default', source: 'kits/default.ts' }]);

      await runCommand({ kitEntries: singleKitEntry(), json: false });

      expect(stderrText()).not.toContain('Warning:');
    });

    it('stays silent when the manifest entry records no hashes', async () => {
      mockCheckDrift.mockReturnValue({ kind: 'unverified' });
      mockCheckSourceDrift.mockReturnValue({ kind: 'unverified' });

      await runCommand({ kitEntries: singleKitEntry(), json: false });

      expect(stderrText()).not.toContain('Warning:');
    });

    it('runs the kit and stays silent when a file it would hash cannot be read', async () => {
      arrangeUnreadableSource();

      const exitCode = await runCommand({ kitEntries: singleKitEntry(), json: false });

      expect(exitCode).toBe(0);
      expect(stdoutText()).toContain('report output');
      expect(stderrText()).not.toContain('Warning:');
    });

    it('stays silent when a compiled file the manifest names is gone', async () => {
      mockCheckDrift.mockReturnValue({ kind: 'missing', resolvedPath: '/abs/default.js' });
      mockCheckSourceDrift.mockReturnValue({ kind: 'missing', resolvedPath: '/abs/default.ts' });

      await runCommand({ kitEntries: singleKitEntry(), json: false });

      expect(stderrText()).not.toContain('Warning:');
    });

    it('does not read the manifest under --jit, which runs from source', async () => {
      arrangeTargetDrift();

      await runCommand(
        {
          kitEntries: [{ name: 'default', source: { path: '.readyup/kits/default.ts' }, checklists: [] }],
          json: false,
        },
        true,
      );

      expect(mockReadManifest).not.toHaveBeenCalled();
      expect(stderrText()).not.toContain('Warning:');
    });

    it('stays silent for a --url kit, which no local manifest describes', async () => {
      arrangeTargetDrift();
      mockLoadRemoteKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      const url = 'https://example.com/kits/deploy.js';

      await runCommand({ kitEntries: [{ name: url, source: { url }, checklists: [] }], json: false });

      expect(stderrText()).not.toContain('Warning:');
      expect(mockCheckDrift).not.toHaveBeenCalled();
    });
  });

  describe('JSON mode', () => {
    it('captures both advisories in the report while keeping stdout to the JSON document', async () => {
      arrangeTargetDrift();
      arrangeSourceStale();
      mockFormatJsonReport.mockReturnValue('{"kits":[]}');

      await runCommand({ kitEntries: singleKitEntry(), json: true });

      expect(reportedWarnings().map((warning) => warning.code)).toStrictEqual(['target-drift', 'source-stale']);
      expect(stdoutText()).toBe('{"kits":[]}\n');
    });

    it('writes the advisory to stderr in JSON mode as well', async () => {
      arrangeSourceStale();

      await runCommand({ kitEntries: singleKitEntry(), json: true });

      expect(stderrText()).toContain('compiled from an older source');
    });

    it('carries no warnings when the manifest agrees with what is on disk', async () => {
      await runCommand({ kitEntries: singleKitEntry(), json: true });

      expect(reportedWarnings()).toStrictEqual([]);
    });

    it('leaves the exit code alone', async () => {
      arrangeTargetDrift();

      const exitCode = await runCommand({ kitEntries: singleKitEntry(), json: true });

      expect(exitCode).toBe(0);
    });
  });
});
