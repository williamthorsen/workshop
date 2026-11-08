import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RdyReport } from '../../kits/types.ts';
import type { listUnusedPragmaWarnings } from '../pragma-report.ts';
import type { RunRdyOptions } from '../runRdy.ts';

const mockLoadRdyKit = vi.hoisted(() => vi.fn());
const mockRunRdy = vi.hoisted(() => vi.fn<(checklist: unknown, options?: RunRdyOptions) => Promise<RdyReport>>());
const mockReadManifestTracking = vi.hoisted(() => vi.fn());
const mockListKitStalenessWarnings = vi.hoisted(() => vi.fn());
const mockListUnusedPragmaWarnings = vi.hoisted(() => vi.fn<typeof listUnusedPragmaWarnings>());
const mockListUnmarkedGeneratedSourceWarnings = vi.hoisted(() => vi.fn());

vi.mock(import('../../kits/loadRdyKit.ts'), () => ({
  loadRdyKit: mockLoadRdyKit,
}));

vi.mock(import('../runRdy.ts'), () => ({
  runRdy: mockRunRdy,
}));

// Mocked so that no case reads the repo's own manifest or hashes files on disk. `loadKit.ts` stays real.
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

import { createUncachedRemoteContext } from '../../test-utils/createUncachedRemoteContext.ts';
import type { ResolvedKitEntry } from '../ResolvedKitEntry.ts';
import { type KitRunEvent, type KitRunSettings, runKitEntries } from '../runKitEntries.ts';
import { makeKit, singleKitEntry } from '../test-utils/kit-fixtures.ts';

/** A staleness warning as the kit-staleness report returns it. */
const TARGET_DRIFT = {
  code: 'target-drift',
  message: 'compiled kit "alpha" does not match the hash that the manifest recorded for it.',
  remedy: 'Move the edits into the source, then run `rdy compile --force`.',
};

/** A warning as the unmarked-generated report returns it. */
const GENERATED_UNMARKED = {
  code: 'generated-unmarked',
  message: 'dist/app.mjs looks like bundler output and is not marked as generated.',
  remedy: 'Add `/dist/app.mjs linguist-generated=true` to .gitattributes, so that kits stop sweeping it.',
};

const PASSING_REPORT: RdyReport = { results: [], passed: true, durationMs: 0 };

describe(runKitEntries, () => {
  beforeEach(() => {
    mockReadManifestTracking.mockReturnValue({ tracking: undefined, warnings: [] });
    mockListKitStalenessWarnings.mockReturnValue([]);
    mockListUnusedPragmaWarnings.mockReturnValue([]);
    mockListUnmarkedGeneratedSourceWarnings.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockLoadRdyKit.mockReset();
    mockRunRdy.mockReset();
    mockReadManifestTracking.mockReset();
    mockListKitStalenessWarnings.mockReset();
    mockListUnusedPragmaWarnings.mockReset();
    mockListUnmarkedGeneratedSourceWarnings.mockReset();
  });

  describe('event sequence', () => {
    it('yields the events of a passing kit in step order', async () => {
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue(PASSING_REPORT);

      const events = await collectEvents(singleKitEntry());

      expect(events.map((event) => event.kind)).toStrictEqual([
        'runStarted',
        'kitLoaded',
        'checklistReported',
        'checklistReported',
        'kitFinished',
        'runFinished',
      ]);
      expect(findRunFinished(events)).toMatchObject({ allPassed: true, failedKitCount: 0 });
    });

    it('reports a failing check through the outcome without failing the kit', async () => {
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValueOnce(PASSING_REPORT).mockResolvedValueOnce({ ...PASSING_REPORT, passed: false });

      const events = await collectEvents(singleKitEntry());

      expect(findRunFinished(events)).toMatchObject({ allPassed: false, failedKitCount: 0 });
    });

    it('yields a kit that did not load as failed, and continues with the next kit', async () => {
      mockLoadRdyKit
        .mockRejectedValueOnce(new Error('Kit not found'))
        .mockResolvedValueOnce({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue(PASSING_REPORT);

      const events = await collectEvents([
        { name: 'broken', source: { path: '.readyup/kits/broken.js' }, checklists: ['deploy'] },
        { name: 'healthy', source: { path: '.readyup/kits/healthy.js' }, checklists: ['deploy'] },
      ]);

      expect(events.map((event) => event.kind)).toStrictEqual([
        'runStarted',
        'kitFailed',
        'kitLoaded',
        'checklistReported',
        'kitFinished',
        'runFinished',
      ]);
      expect(events[1]).toMatchObject({ kind: 'kitFailed', reason: 'didNotLoad', entry: { name: 'broken' } });
      expect(mockRunRdy).toHaveBeenCalledTimes(1);
      expect(findRunFinished(events)).toMatchObject({ failedKitCount: 1 });
    });

    it('yields a kit that threw after its first checklist as failed after loading, without finishing it', async () => {
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValueOnce(PASSING_REPORT).mockRejectedValueOnce(new Error('runner crashed'));

      const events = await collectEvents(singleKitEntry());

      expect(events.map((event) => event.kind)).toStrictEqual([
        'runStarted',
        'kitLoaded',
        'checklistReported',
        'kitFailed',
        'runFinished',
      ]);
      expect(events[3]).toMatchObject({ kind: 'kitFailed', reason: 'failedAfterLoad', warnings: [] });
    });

    it('carries the kit’s staleness warnings on the failure when checklist selection throws', async () => {
      mockListKitStalenessWarnings.mockReturnValue([TARGET_DRIFT]);
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });

      const events = await collectEvents(singleKitEntry(['nonexistent']));

      expect(events.map((event) => event.kind)).toStrictEqual(['runStarted', 'kitFailed', 'runFinished']);
      expect(events[1]).toMatchObject({
        kind: 'kitFailed',
        error: { code: 'usage' },
        reason: 'failedAfterLoad',
        warnings: [TARGET_DRIFT],
      });
    });

    it('yields the manifest read and the run-level warnings for a run that selected no kits', async () => {
      const events = await collectEvents([]);

      expect(events.map((event) => event.kind)).toStrictEqual(['runStarted', 'runFinished']);
      expect(mockReadManifestTracking).toHaveBeenCalledTimes(1);
      expect(mockListUnusedPragmaWarnings).toHaveBeenCalledTimes(1);
    });
  });

  describe('checklist selection', () => {
    it('runs all checklists when no checklist filter is given', async () => {
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue(PASSING_REPORT);

      await collectEvents(singleKitEntry());

      expect(mockRunRdy).toHaveBeenCalledTimes(2);
    });

    it('filters to named checklists only', async () => {
      const kit = makeKit();
      mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue(PASSING_REPORT);

      await collectEvents(singleKitEntry(['deploy']));

      expect(mockRunRdy).toHaveBeenCalledExactlyOnceWith(
        kit.checklists[0],
        expect.objectContaining({ defaultSeverity: 'error', failOn: 'error' }),
      );
    });

    it('records the ids of a checklist that the run leaves unselected', async () => {
      const kit = makeKit({
        checklists: [
          { name: 'deploy', checks: [{ name: 'a', id: 'selected', check: () => true }] },
          { name: 'infra', checks: [{ name: 'b', id: 'unselected', check: () => true }] },
        ],
      });
      mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue(PASSING_REPORT);

      await collectEvents(singleKitEntry(['deploy']));

      const [ledger] = mockListUnusedPragmaWarnings.mock.lastCall ?? [];
      expect(ledger?.checkIds().map((ids) => ids.bare)).toStrictEqual(['selected', 'unselected']);
    });
  });

  describe('runner options', () => {
    it('passes kit path to local kit loader', async () => {
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue(PASSING_REPORT);

      await collectEvents([{ name: 'custom', source: { path: 'custom/path.ts' }, checklists: [] }]);

      expect(mockLoadRdyKit).toHaveBeenCalledWith('custom/path.ts', 'custom');
    });

    it('asks the runner to diagnose only when --diagnose was passed', async () => {
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue(PASSING_REPORT);

      await collectEvents(singleKitEntry(['deploy']));
      expect(mockRunRdy).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ diagnose: false }));

      await collectEvents(singleKitEntry(['deploy']), { diagnose: true });
      expect(mockRunRdy).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ diagnose: true }));
    });

    it('passes the kit’s resolved failOn to runRdy', async () => {
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit({ failOn: 'recommend' }), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue(PASSING_REPORT);

      await collectEvents(singleKitEntry(['deploy']));

      expect(mockRunRdy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ failOn: 'recommend' }));
    });
  });

  describe('staleness advisories', () => {
    it('reads the manifest once per invocation, not once per kit', async () => {
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue(PASSING_REPORT);

      await collectEvents(twoKitEntries());

      expect(mockReadManifestTracking).toHaveBeenCalledTimes(1);
    });

    it('tells the manifest read whether the run is just-in-time', async () => {
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue(PASSING_REPORT);

      await collectEvents(singleKitEntry(['deploy']), {}, true);

      expect(mockReadManifestTracking).toHaveBeenCalledWith(true);
    });

    it('advises on each kit against the source to which that kit resolved', async () => {
      const tracking = { manifest: { version: 1, kits: [] }, manifestDir: '.readyup' };
      mockReadManifestTracking.mockReturnValue({ tracking, warnings: [] });
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue(PASSING_REPORT);

      await collectEvents(twoKitEntries());

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

    it('yields a kit’s warnings on its load event and leaves the outcome alone', async () => {
      mockListKitStalenessWarnings.mockReturnValue([TARGET_DRIFT]);
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue(PASSING_REPORT);

      const events = await collectEvents(singleKitEntry(['deploy']));

      expect(events.find((event) => event.kind === 'kitLoaded')).toMatchObject({ warnings: [TARGET_DRIFT] });
      expect(findRunFinished(events)).toMatchObject({ allPassed: true, failedKitCount: 0 });
    });
  });

  describe('run-level advisories', () => {
    it('reports unused pragmas once over one ledger shared by every kit of the invocation', async () => {
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue(PASSING_REPORT);

      await collectEvents(twoKitEntries());

      const ledgers = mockRunRdy.mock.calls.map(([, options]) => options?.pragmaLedger);
      expect(ledgers).toHaveLength(2);
      expect(new Set(ledgers).size).toBe(1);
      expect(mockListUnusedPragmaWarnings).toHaveBeenCalledExactlyOnceWith(ledgers[0]);
    });

    it('reports unused pragmas over the kits that ran when another failed to load', async () => {
      mockLoadRdyKit.mockRejectedValue(new Error('Kit not found'));

      await collectEvents(singleKitEntry(['deploy']));

      expect(mockListUnusedPragmaWarnings).toHaveBeenCalledTimes(1);
    });

    it('reports unmarked generated sources over the invocation ledger, after the unused-pragma report', async () => {
      mockListUnmarkedGeneratedSourceWarnings.mockResolvedValue([GENERATED_UNMARKED]);
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue(PASSING_REPORT);

      const events = await collectEvents(singleKitEntry(['deploy']));

      const [ledger] = mockRunRdy.mock.calls.map(([, options]) => options?.pragmaLedger);
      expect(mockListUnmarkedGeneratedSourceWarnings).toHaveBeenCalledExactlyOnceWith(ledger);
      const [pragmaOrder] = mockListUnusedPragmaWarnings.mock.invocationCallOrder;
      const [generatedOrder] = mockListUnmarkedGeneratedSourceWarnings.mock.invocationCallOrder;
      expect(pragmaOrder).toBeLessThan(generatedOrder ?? 0);
      expect(findRunFinished(events)).toMatchObject({ allPassed: true, warnings: [GENERATED_UNMARKED] });
    });
  });
});

// region | Helpers

/** Runs the generator to completion over the given entries, filling in every setting that the test did not name. */
async function collectEvents(
  kitEntries: ResolvedKitEntry[],
  settings: Partial<KitRunSettings> = {},
  isJit = false,
): Promise<KitRunEvent[]> {
  const events: KitRunEvent[] = [];
  const fullSettings: KitRunSettings = {
    diagnose: false,
    failOn: undefined,
    remote: createUncachedRemoteContext(),
    reportOn: undefined,
    unrunSources: [],
    ...settings,
  };
  for await (const event of runKitEntries(kitEntries, fullSettings, isJit)) {
    events.push(event);
  }
  return events;
}

/** Returns the run's closing event, failing the test when the run did not yield one. */
function findRunFinished(events: KitRunEvent[]): KitRunEvent {
  const event = events.at(-1);
  expect(event?.kind).toBe('runFinished');
  if (event === undefined) throw new Error('The run yielded no events');
  return event;
}

/** Builds two entries whose names and compiled paths differ, so that a kit paired with the wrong source shows. */
function twoKitEntries(): ResolvedKitEntry[] {
  return [
    { name: 'alpha', source: { path: '.readyup/kits/alpha.js' }, checklists: ['deploy'] },
    { name: 'beta', source: { path: '.readyup/kits/beta.js' }, checklists: ['deploy'] },
  ];
}

// endregion | Helpers
