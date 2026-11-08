import { beforeEach, describe, expect, it } from 'vitest';

import { kitLoadError } from '../../errors/RdyError.ts';
import type { RdyReport } from '../../kits/types.ts';
import type { RaisedWarning } from '../../schemas/common.ts';
import { createUncachedRemoteContext } from '../../test-utils/createUncachedRemoteContext.ts';
import type { ManifestTracking } from '../kit-staleness.ts';
import type { ResolvedKitEntry } from '../ResolvedKitEntry.ts';
import { type KitRunEvent, type KitRunSettings, runKitEntries } from '../runKitEntries.ts';
import { createRunFakes, type RunFakes } from '../test-utils/createRunFakes.ts';
import { buildSingleKitEntry, makeKit } from '../test-utils/kit-fixtures.ts';

/** A staleness warning as the kit-staleness report returns it. */
const TARGET_DRIFT: RaisedWarning = {
  code: 'target-drift',
  message: 'compiled kit "alpha" does not match the hash that the manifest recorded for it.',
  remedy: 'Move the edits into the source, then run `rdy compile --force`.',
};

/** A warning as the unmarked-generated report returns it. */
const GENERATED_UNMARKED: RaisedWarning = {
  code: 'generated-unmarked',
  message: 'dist/app.mjs looks like bundler output and is not marked as generated.',
  remedy: 'Add `/dist/app.mjs linguist-generated=true` to .gitattributes, so that kits stop sweeping it.',
};

const PASSING_REPORT: RdyReport = { results: [], passed: true, durationMs: 0 };

describe(runKitEntries, () => {
  let fakes: RunFakes;

  beforeEach(() => {
    fakes = createRunFakes();
  });

  describe('event sequence', () => {
    it('yields the events of a passing kit in step order', async () => {
      fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValue(PASSING_REPORT);

      const events = await collectEvents(buildSingleKitEntry(), fakes);

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
      fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValueOnce(PASSING_REPORT).mockResolvedValueOnce({ ...PASSING_REPORT, passed: false });

      const events = await collectEvents(buildSingleKitEntry(), fakes);

      expect(findRunFinished(events)).toMatchObject({ allPassed: false, failedKitCount: 0 });
    });

    it('yields a kit that did not load as failed, and continues with the next kit', async () => {
      fakes.loadKit
        .mockRejectedValueOnce(kitLoadError('Kit not found'))
        .mockResolvedValueOnce({ kit: makeKit(), compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValue(PASSING_REPORT);

      const events = await collectEvents(
        [
          { name: 'broken', source: { path: '.readyup/kits/broken.js' }, checklists: ['deploy'] },
          { name: 'healthy', source: { path: '.readyup/kits/healthy.js' }, checklists: ['deploy'] },
        ],
        fakes,
      );

      expect(events.map((event) => event.kind)).toStrictEqual([
        'runStarted',
        'kitFailed',
        'kitLoaded',
        'checklistReported',
        'kitFinished',
        'runFinished',
      ]);
      expect(events[1]).toMatchObject({ kind: 'kitFailed', reason: 'didNotLoad', entry: { name: 'broken' } });
      expect(fakes.runRdy).toHaveBeenCalledTimes(1);
      expect(findRunFinished(events)).toMatchObject({ failedKitCount: 1 });
    });

    it('yields a kit that threw after its first checklist as failed after loading, without finishing it', async () => {
      fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValueOnce(PASSING_REPORT).mockRejectedValueOnce(new Error('runner crashed'));

      const events = await collectEvents(buildSingleKitEntry(), fakes);

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
      fakes.listKitStalenessWarnings.mockReturnValue([TARGET_DRIFT]);
      fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });

      const events = await collectEvents(buildSingleKitEntry(['nonexistent']), fakes);

      expect(events.map((event) => event.kind)).toStrictEqual(['runStarted', 'kitFailed', 'runFinished']);
      expect(events[1]).toMatchObject({
        kind: 'kitFailed',
        error: { code: 'usage' },
        reason: 'failedAfterLoad',
        warnings: [TARGET_DRIFT],
      });
    });

    it('yields the manifest read and the run-level warnings for a run that selected no kits', async () => {
      const events = await collectEvents([], fakes);

      expect(events.map((event) => event.kind)).toStrictEqual(['runStarted', 'runFinished']);
      expect(fakes.readManifestTracking).toHaveBeenCalledTimes(1);
      expect(fakes.listUnusedPragmaWarnings).toHaveBeenCalledTimes(1);
    });
  });

  describe('checklist selection', () => {
    it('runs all checklists when no checklist filter is given', async () => {
      fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValue(PASSING_REPORT);

      await collectEvents(buildSingleKitEntry(), fakes);

      expect(fakes.runRdy).toHaveBeenCalledTimes(2);
    });

    it('filters to named checklists only', async () => {
      const kit = makeKit();
      fakes.loadKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValue(PASSING_REPORT);

      await collectEvents(buildSingleKitEntry(['deploy']), fakes);

      expect(fakes.runRdy).toHaveBeenCalledExactlyOnceWith(
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
      fakes.loadKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValue(PASSING_REPORT);

      await collectEvents(buildSingleKitEntry(['deploy']), fakes);

      const [ledger] = fakes.listUnusedPragmaWarnings.mock.lastCall ?? [];
      expect(ledger?.checkIds().map((ids) => ids.bare)).toStrictEqual(['selected', 'unselected']);
    });
  });

  describe('runner options', () => {
    it('passes each entry and the run’s remote context to the kit loader', async () => {
      fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValue(PASSING_REPORT);
      const entry: ResolvedKitEntry = { name: 'custom', source: { path: 'custom/path.ts' }, checklists: [] };
      const remote = createUncachedRemoteContext();

      await collectEvents([entry], fakes, { remote });

      expect(fakes.loadKit).toHaveBeenCalledExactlyOnceWith(entry, remote);
    });

    it('asks the runner to diagnose only when --diagnose was passed', async () => {
      fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValue(PASSING_REPORT);

      await collectEvents(buildSingleKitEntry(['deploy']), fakes);
      expect(fakes.runRdy).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ diagnose: false }));

      await collectEvents(buildSingleKitEntry(['deploy']), fakes, { diagnose: true });
      expect(fakes.runRdy).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ diagnose: true }));
    });

    it('passes the kit’s resolved failOn to runRdy', async () => {
      fakes.loadKit.mockResolvedValue({ kit: makeKit({ failOn: 'recommend' }), compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValue(PASSING_REPORT);

      await collectEvents(buildSingleKitEntry(['deploy']), fakes);

      expect(fakes.runRdy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ failOn: 'recommend' }));
    });
  });

  describe('staleness advisories', () => {
    it('reads the manifest once per invocation, not once per kit', async () => {
      fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValue(PASSING_REPORT);

      await collectEvents(twoKitEntries(), fakes);

      expect(fakes.readManifestTracking).toHaveBeenCalledTimes(1);
    });

    it('tells the manifest read whether the run is just-in-time', async () => {
      fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValue(PASSING_REPORT);

      await collectEvents(buildSingleKitEntry(['deploy']), fakes, {}, true);

      expect(fakes.readManifestTracking).toHaveBeenCalledWith(true);
    });

    it('advises on each kit against the source to which that kit resolved', async () => {
      const tracking: ManifestTracking = { manifest: { version: 1, kits: [] }, manifestDir: '.readyup' };
      fakes.readManifestTracking.mockReturnValue({ tracking, warnings: [] });
      fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValue(PASSING_REPORT);

      await collectEvents(twoKitEntries(), fakes);

      expect(fakes.listKitStalenessWarnings).toHaveBeenCalledTimes(2);
      expect(fakes.listKitStalenessWarnings).toHaveBeenNthCalledWith(
        1,
        'alpha',
        { path: '.readyup/kits/alpha.js' },
        tracking,
      );
      expect(fakes.listKitStalenessWarnings).toHaveBeenNthCalledWith(
        2,
        'beta',
        { path: '.readyup/kits/beta.js' },
        tracking,
      );
    });

    it('yields a kit’s warnings on its load event and leaves the outcome alone', async () => {
      fakes.listKitStalenessWarnings.mockReturnValue([TARGET_DRIFT]);
      fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValue(PASSING_REPORT);

      const events = await collectEvents(buildSingleKitEntry(['deploy']), fakes);

      expect(events.find((event) => event.kind === 'kitLoaded')).toMatchObject({ warnings: [TARGET_DRIFT] });
      expect(findRunFinished(events)).toMatchObject({ allPassed: true, failedKitCount: 0 });
    });
  });

  describe('run-level advisories', () => {
    it('reports unused pragmas once over one ledger shared by every kit of the invocation', async () => {
      fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValue(PASSING_REPORT);

      await collectEvents(twoKitEntries(), fakes);

      const ledgers = fakes.runRdy.mock.calls.map(([, options]) => options?.pragmaLedger);
      expect(ledgers).toHaveLength(2);
      expect(new Set(ledgers).size).toBe(1);
      expect(fakes.listUnusedPragmaWarnings).toHaveBeenCalledExactlyOnceWith(ledgers[0]);
    });

    it('reports unused pragmas over the kits that ran when another failed to load', async () => {
      fakes.loadKit.mockRejectedValue(kitLoadError('Kit not found'));

      await collectEvents(buildSingleKitEntry(['deploy']), fakes);

      expect(fakes.listUnusedPragmaWarnings).toHaveBeenCalledTimes(1);
    });

    it('reports unmarked generated sources over the invocation ledger, after the unused-pragma report', async () => {
      fakes.listUnmarkedGeneratedSourceWarnings.mockResolvedValue([GENERATED_UNMARKED]);
      fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValue(PASSING_REPORT);

      const events = await collectEvents(buildSingleKitEntry(['deploy']), fakes);

      const [ledger] = fakes.runRdy.mock.calls.map(([, options]) => options?.pragmaLedger);
      expect(fakes.listUnmarkedGeneratedSourceWarnings).toHaveBeenCalledExactlyOnceWith(ledger);
      const [pragmaOrder] = fakes.listUnusedPragmaWarnings.mock.invocationCallOrder;
      const [generatedOrder] = fakes.listUnmarkedGeneratedSourceWarnings.mock.invocationCallOrder;
      expect(pragmaOrder).toBeLessThan(generatedOrder ?? 0);
      expect(findRunFinished(events)).toMatchObject({ allPassed: true, warnings: [GENERATED_UNMARKED] });
    });
  });
});

// region | Helpers

/** Runs the generator to completion over the given entries, filling in every setting that the test did not name. */
async function collectEvents(
  kitEntries: ResolvedKitEntry[],
  fakes: RunFakes,
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
  for await (const event of runKitEntries(kitEntries, fullSettings, isJit, fakes)) {
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
