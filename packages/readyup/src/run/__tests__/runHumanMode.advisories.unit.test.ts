import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RdyReport } from '../../kits/types.ts';
import type { SummaryRow } from '../../layout/layoutEngine.ts';
import { RemoteFetchError } from '../../remote/RemoteFetchError.ts';
import { createUncachedRemoteContext } from '../../test-utils/createUncachedRemoteContext.ts';
import type { UnrunSource } from '../KitSelection.ts';
import type { ResolvedKitEntry } from '../ResolvedKitEntry.ts';
import type { RunRdyOptions } from '../runRdy.ts';

const mockLoadRdyKit = vi.hoisted(() => vi.fn());
const mockRunRdy = vi.hoisted(() => vi.fn<(checklist: unknown, options?: RunRdyOptions) => Promise<RdyReport>>());
const mockReportRdy = vi.hoisted(() => vi.fn());
const mockFormatCombinedSummary = vi.hoisted(() => vi.fn<(rows: SummaryRow[]) => string>());
const mockResolveGitHubToken = vi.hoisted(() => vi.fn());
const mockLoadRemoteKit = vi.hoisted(() => vi.fn());
const mockReadManifestTracking = vi.hoisted(() => vi.fn());
const mockListKitStalenessWarnings = vi.hoisted(() => vi.fn());
const mockListUnusedPragmaWarnings = vi.hoisted(() => vi.fn());
const mockListUnmarkedGeneratedSourceWarnings = vi.hoisted(() => vi.fn());

/** A warning as the unmarked-generated report returns it. */
const GENERATED_UNMARKED = {
  code: 'generated-unmarked',
  message:
    'dist/app.mjs looks like bundler output (its mean line length exceeds 250 characters) and is not marked as generated.',
  remedy: 'Add `/dist/app.mjs linguist-generated=true` to .gitattributes, so that kits stop sweeping it.',
};

/** A staleness warning as the staleness report returns it for the `default` kit. */
const TARGET_DRIFT_DEFAULT = {
  code: 'target-drift',
  message: 'compiled kit "default" does not match the hash that the manifest recorded for it.',
  remedy: 'Move the edits into the source, then run `rdy compile --force`.',
};

vi.mock(import('../../kits/loadRdyKit.ts'), () => ({
  loadRdyKit: mockLoadRdyKit,
}));

vi.mock(import('../runRdy.ts'), () => ({
  runRdy: mockRunRdy,
}));

vi.mock(import('../../reporting/reportRdy.ts'), async () => {
  const actual = await vi.importActual<typeof import('../../reporting/reportRdy.ts')>('../../reporting/reportRdy.ts');
  return {
    ...actual,
    reportRdy: mockReportRdy,
  };
});

vi.mock(import('../../reporting/formatCombinedSummary.ts'), () => ({
  formatCombinedSummary: mockFormatCombinedSummary,
}));

vi.mock(import('../../remote/resolveGitHubToken.ts'), () => ({
  resolveGitHubToken: mockResolveGitHubToken,
}));

vi.mock(import('../../remote/loadRemoteKit.ts'), () => ({
  loadRemoteKit: mockLoadRemoteKit,
}));

// Mocked so that no case reads the repo's own manifest or hashes files on disk. `loadKit.ts` stays real, and the
// rendering cases assert on its errors.
vi.mock(import('../kit-staleness.ts'), () => ({
  readManifestTracking: mockReadManifestTracking,
  listKitStalenessWarnings: mockListKitStalenessWarnings,
}));

// Mocked so that no case reads the sources named by the ledger; what the report itself returns is covered by its
// own tests.
vi.mock(import('../pragma-report.ts'), () => ({
  listUnusedPragmaWarnings: mockListUnusedPragmaWarnings,
}));

// Mocked for the same reason as the pragma report.
vi.mock(import('../generated-report.ts'), () => ({
  listUnmarkedGeneratedSourceWarnings: mockListUnmarkedGeneratedSourceWarnings,
}));

import { runHumanMode } from '../runHumanMode.ts';
import { makeKit, singleKitEntry } from '../test-utils/kit-fixtures.ts';
import { runHuman } from '../test-utils/runHuman.ts';

describe(runHumanMode, () => {
  beforeEach(() => {
    mockReportRdy.mockReturnValue({ body: 'report output', hasVisibleResults: true });
    mockFormatCombinedSummary.mockReturnValue('combined summary');
    mockReadManifestTracking.mockReturnValue({ tracking: undefined, warnings: [] });
    mockListKitStalenessWarnings.mockReturnValue([]);
    mockListUnusedPragmaWarnings.mockReturnValue([]);
    mockListUnmarkedGeneratedSourceWarnings.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockLoadRdyKit.mockReset();
    mockRunRdy.mockReset();
    mockReportRdy.mockReset();
    mockFormatCombinedSummary.mockReset();
    mockResolveGitHubToken.mockReset();
    mockLoadRemoteKit.mockReset();
    mockReadManifestTracking.mockReset();
    mockListKitStalenessWarnings.mockReset();
    mockListUnusedPragmaWarnings.mockReset();
    mockListUnmarkedGeneratedSourceWarnings.mockReset();
  });

  describe('staleness advisories', () => {
    const TARGET_DRIFT = {
      code: 'target-drift',
      message: 'compiled kit "alpha" does not match the hash that the manifest recorded for it.',
      remedy: 'Move the edits into the source, then run `rdy compile --force`.',
    };

    /** Builds two entries whose names and compiled paths differ, so that a kit paired with the wrong source shows. */
    function twoKitEntries() {
      return [
        { name: 'alpha', source: { path: '.readyup/kits/alpha.js' }, checklists: ['deploy'] },
        { name: 'beta', source: { path: '.readyup/kits/beta.js' }, checklists: ['deploy'] },
      ];
    }

    it('reads the manifest once per invocation, not once per kit', async () => {
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runHuman(twoKitEntries());

      expect(mockReadManifestTracking).toHaveBeenCalledTimes(1);
    });

    it('tells the manifest read whether the run is just-in-time', async () => {
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runHuman(singleKitEntry(['deploy']), { isJit: true });

      expect(mockReadManifestTracking).toHaveBeenCalledWith(true);
    });

    it('advises on each kit against the source to which that kit resolved', async () => {
      const tracking = { manifest: { version: 1, kits: [] }, manifestDir: '.readyup' };
      mockReadManifestTracking.mockReturnValue({ tracking, warnings: [] });
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runHuman(twoKitEntries());

      expect(mockListKitStalenessWarnings).toHaveBeenCalledTimes(2);
      expect(mockListKitStalenessWarnings).toHaveBeenNthCalledWith(
        1,
        'alpha',
        { path: '.readyup/kits/alpha.js' },
        tracking,
      );
      expect(mockListKitStalenessWarnings).toHaveBeenNthCalledWith(
        2,
        'beta',
        { path: '.readyup/kits/beta.js' },
        tracking,
      );
    });

    it('leaves the exit code alone, since verify is the enforcing gate', async () => {
      mockListKitStalenessWarnings.mockReturnValue([TARGET_DRIFT]);
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      const { exitCode } = await runHuman(singleKitEntry(['deploy']));

      expect(exitCode).toBe(0);
    });
  });

  describe('unused-pragma advisories', () => {
    /** Builds two entries whose names and compiled paths differ, so that a per-kit ledger would show as two. */
    function twoKitEntries() {
      return [
        { name: 'alpha', source: { path: '.readyup/kits/alpha.js' }, checklists: ['deploy'] },
        { name: 'beta', source: { path: '.readyup/kits/beta.js' }, checklists: ['deploy'] },
      ];
    }

    it('reports once over one ledger shared by every kit of the invocation', async () => {
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runHuman(twoKitEntries());

      const ledgers = mockRunRdy.mock.calls.map(([, options]) => options?.pragmaLedger);
      expect(ledgers).toHaveLength(2);
      expect(new Set(ledgers).size).toBe(1);
      expect(mockListUnusedPragmaWarnings).toHaveBeenCalledExactlyOnceWith(ledgers[0]);
    });

    it('reports after the summary table, the last block in which a pragma’s file may be named', async () => {
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runHuman(twoKitEntries());

      const [summaryOrder] = mockFormatCombinedSummary.mock.invocationCallOrder;
      const [reportOrder] = mockListUnusedPragmaWarnings.mock.invocationCallOrder;
      expect(summaryOrder).toBeLessThan(reportOrder ?? 0);
    });

    it('reports over the kits that ran when another failed to load', async () => {
      mockLoadRdyKit.mockRejectedValue(new Error('Kit not found'));

      const { exitCode } = await runHuman(singleKitEntry(['deploy']));

      expect(mockListUnusedPragmaWarnings).toHaveBeenCalledTimes(1);
      expect(exitCode).toBe(2);
    });
  });

  describe('unmarked-generated advisories', () => {
    it('reports over the invocation ledger, after the unused-pragma report, and leaves the exit code alone', async () => {
      mockListUnmarkedGeneratedSourceWarnings.mockResolvedValue([GENERATED_UNMARKED]);
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      const { exitCode } = await runHuman(singleKitEntry(['deploy']));

      const [ledger] = mockRunRdy.mock.calls.map(([, options]) => options?.pragmaLedger);
      expect(mockListUnmarkedGeneratedSourceWarnings).toHaveBeenCalledExactlyOnceWith(ledger);
      const [pragmaOrder] = mockListUnusedPragmaWarnings.mock.invocationCallOrder;
      const [generatedOrder] = mockListUnmarkedGeneratedSourceWarnings.mock.invocationCallOrder;
      expect(pragmaOrder).toBeLessThan(generatedOrder ?? 0);
      expect(exitCode).toBe(0);
    });
  });

  describe('warning output', () => {
    const MANIFEST_UNREADABLE = { code: 'manifest-unreadable', message: 'manifest unreadable.', remedy: 'Rewrite it.' };
    const PRAGMA_UNUSED = { code: 'pragma-unused', message: 'pragma unused.', remedy: 'Remove it.' };

    it('writes each warning on stderr where its producer runs, around the stdout blocks', async () => {
      mockReadManifestTracking.mockReturnValue({ tracking: undefined, warnings: [MANIFEST_UNREADABLE] });
      mockListKitStalenessWarnings.mockReturnValue([TARGET_DRIFT_DEFAULT]);
      mockListUnusedPragmaWarnings.mockReturnValue([PRAGMA_UNUSED]);
      mockListUnmarkedGeneratedSourceWarnings.mockResolvedValue([GENERATED_UNMARKED]);
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: '999.0.0' });
      mockRunRdy.mockResolvedValue({
        results: [],
        passed: true,
        durationMs: 0,
        diagnoses: [{ name: 'a', verdict: 'masked-pass' }],
      });

      const writes = await runHumanRecordingWrites(singleKitEntry(['deploy']), [
        { spelling: 'npm:a', requestedNames: ['default'], publishedNames: ['x'] },
      ]);

      // Collapse each stdout block to a marker, since only its position relative to the warnings is under test.
      const sequence = writes
        .filter(({ text }) => text !== '\n')
        .map(({ stream, text }) => (stream === 'stdout' ? 'stdout' : text));
      expect(sequence).toStrictEqual([
        `Warning: ${MANIFEST_UNREADABLE.message} ${MANIFEST_UNREADABLE.remedy}\n`,
        `Warning: ${TARGET_DRIFT_DEFAULT.message} ${TARGET_DRIFT_DEFAULT.remedy}\n`,
        expect.stringMatching(/^Warning: kit "default" was compiled by readyup 999\.0\.0, ahead of/),
        'stdout',
        expect.stringMatching(/^Warning: skipped check "a" in kit "default" \/ checklist "deploy" would have passed\./),
        `Warning: ${PRAGMA_UNUSED.message} ${PRAGMA_UNUSED.remedy}\n`,
        `Warning: ${GENERATED_UNMARKED.message} ${GENERATED_UNMARKED.remedy}\n`,
        expect.stringMatching(/^Warning: configured source "npm:a" publishes no kit named "default"/),
        'stdout',
      ]);
    });
  });

  describe('raised hints', () => {
    const GITHUB_URL = 'https://raw.githubusercontent.com/acme/private/main/.readyup/kits/deploy.js';
    const GITHUB_HINT = 'If the repository is private, set GITHUB_TOKEN or run `gh auth login`.';

    it('puts the hint on a line of its own, below the error', async () => {
      mockResolveGitHubToken.mockReturnValue(undefined);
      mockLoadRemoteKit.mockRejectedValue(new RemoteFetchError(`Failed to fetch remote kit from ${GITHUB_URL}`, 404));

      const { stderr } = await runHuman([{ name: 'deploy', source: { url: GITHUB_URL }, checklists: [] }]);

      expect(stderr).toBe(`Error: Failed to fetch remote kit from ${GITHUB_URL}\n\u{1F449} Hint: ${GITHUB_HINT}\n`);
    });
  });
});

// region | Helpers

/** One write to stdout or stderr, in the order in which the run made it. */
interface RecordedWrite {
  stream: 'stderr' | 'stdout';
  text: string;
}

/** Runs the mode over the given entries and returns every write to stdout and stderr, in one ordered list. */
async function runHumanRecordingWrites(
  kitEntries: ResolvedKitEntry[],
  unrunSources: UnrunSource[],
): Promise<RecordedWrite[]> {
  const writes: RecordedWrite[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    writes.push({ stream: 'stdout', text: String(chunk) });
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    writes.push({ stream: 'stderr', text: String(chunk) });
    return true;
  });

  const remote = createUncachedRemoteContext();
  await runHumanMode(
    kitEntries,
    { diagnose: false, failOn: undefined, quiet: false, remote, reportOn: undefined, unrunSources },
    false,
  );

  return writes;
}

// endregion | Helpers
