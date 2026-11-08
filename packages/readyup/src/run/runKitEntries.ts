import { type RdyError, toRdyError } from '../errors/RdyError.ts';
import type { LoadedRdyKit } from '../kits/loadRdyKit.ts';
import type { RdyChecklist, RdyKit, RdyReport, RdyStagedChecklist, Severity } from '../kits/types.ts';
import type { NotRunReason } from '../layout/layoutEngine.ts';
import type { RemoteFetchContext } from '../remote/createRemoteFetchContext.ts';
import type { JsonWarning } from '../schemas/common.ts';
import { listUnmarkedGeneratedSourceWarnings } from './generated-report.ts';
import { listKitStalenessWarnings, readManifestTracking } from './kit-staleness.ts';
import type { UnrunSource } from './KitSelection.ts';
import { loadKit } from './loadKit.ts';
import { listUnusedPragmaWarnings } from './pragma-report.ts';
import { createPragmaLedger } from './PragmaLedger.ts';
import { recordKitCheckIds } from './recordKitCheckIds.ts';
import type { ResolvedKitEntry } from './ResolvedKitEntry.ts';
import { resolveThresholds } from './resolveThresholds.ts';
import { runRdy } from './runRdy.ts';
import { selectChecklists } from './selectChecklists.ts';
import { listMaskedSkipWarnings } from './skip-diagnosis.ts';
import { listUnrunSourceWarnings } from './source-report.ts';
import { listVersionSkewWarnings } from './version-skew.ts';

/** What the shared run steps need from the invocation, whichever mode renders the run. */
export interface KitRunSettings {
  diagnose: boolean;
  failOn: Severity | undefined;
  remote: RemoteFetchContext;
  reportOn: Severity | undefined;
  unrunSources: readonly UnrunSource[];
}

/** The collaborators that the run steps call, replaceable so that a test can run the steps without their effects. */
export interface KitRunDependencies {
  listKitStalenessWarnings: typeof listKitStalenessWarnings;
  listUnmarkedGeneratedSourceWarnings: typeof listUnmarkedGeneratedSourceWarnings;
  listUnusedPragmaWarnings: typeof listUnusedPragmaWarnings;
  loadKit: typeof loadKit;
  readManifestTracking: typeof readManifestTracking;
  runRdy: typeof runRdy;
}

/** The real collaborators of the run steps. */
export const defaultKitRunDependencies: KitRunDependencies = {
  listKitStalenessWarnings,
  listUnmarkedGeneratedSourceWarnings,
  listUnusedPragmaWarnings,
  loadKit,
  readManifestTracking,
  runRdy,
};

/**
 * One step boundary of a run, in the order in which the steps run.
 *
 * An event that raises warnings includes them, and the consumer decides where to write them.
 */
export type KitRunEvent =
  | { kind: 'runStarted'; warnings: readonly JsonWarning[] }
  | {
      kind: 'kitLoaded';
      checklists: Array<RdyChecklist | RdyStagedChecklist>;
      compileTimeVersion: LoadedRdyKit['compileTimeVersion'];
      entry: ResolvedKitEntry;
      kit: RdyKit;
      thresholds: ReturnType<typeof resolveThresholds>;
      warnings: readonly JsonWarning[];
    }
  | {
      kind: 'checklistReported';
      checklist: RdyChecklist | RdyStagedChecklist;
      entry: ResolvedKitEntry;
      report: RdyReport;
      warnings: readonly JsonWarning[];
    }
  | { kind: 'kitFinished'; entry: ResolvedKitEntry }
  | {
      kind: 'kitFailed';
      entry: ResolvedKitEntry;
      error: RdyError;
      reason: NotRunReason;
      /** Warnings raised for the kit before the throw and not yet yielded by a `kitLoaded` event. */
      warnings: readonly JsonWarning[];
    }
  | { kind: 'runFinished'; allPassed: boolean; failedKitCount: number; warnings: readonly JsonWarning[] };

/**
 * Runs every kit entry and yields an event at each step boundary.
 *
 * Each kit is its own error boundary: Once the run has dispatched, anything that a kit's steps throw is
 * attributable to that kit alone, so the run yields `kitFailed` for it and continues with the next kit. The
 * scope is positional rather than keyed on `RdyErrorCode`, because a new code would otherwise silently pick a
 * branch. A throw from the consumer while it handles an event ends the run rather than the kit, because
 * `for await` returns the generator rather than throwing into it.
 */
export async function* runKitEntries(
  kitEntries: ResolvedKitEntry[],
  settings: KitRunSettings,
  isJit: boolean,
  dependencies: KitRunDependencies = defaultKitRunDependencies,
): AsyncGenerator<KitRunEvent> {
  const { tracking, warnings: manifestWarnings } = dependencies.readManifestTracking(isJit);
  yield { kind: 'runStarted', warnings: manifestWarnings };

  const pragmaLedger = createPragmaLedger();
  let allPassed = true;
  let failedKitCount = 0;

  for (const entry of kitEntries) {
    let loaded: LoadedRdyKit;
    try {
      loaded = await dependencies.loadKit(entry, settings.remote);
    } catch (error: unknown) {
      failedKitCount++;
      yield { kind: 'kitFailed', entry, error: toRdyError(error), reason: 'didNotLoad', warnings: [] };
      continue;
    }

    const { kit, compileTimeVersion } = loaded;
    let pendingWarnings: readonly JsonWarning[] = [];
    try {
      recordKitCheckIds(kit, pragmaLedger, entry.provenance);
      pendingWarnings = [
        ...dependencies.listKitStalenessWarnings(entry.name, entry.source, tracking),
        ...listVersionSkewWarnings(entry.name, kit, compileTimeVersion, entry.provenance),
      ];

      const checklists = selectChecklists(kit, entry.checklists);
      const thresholds = resolveThresholds(kit, settings.failOn, settings.reportOn);
      const kitWarnings = pendingWarnings;
      pendingWarnings = [];
      yield { kind: 'kitLoaded', checklists, compileTimeVersion, entry, kit, thresholds, warnings: kitWarnings };

      for (const checklist of checklists) {
        const report = await dependencies.runRdy(checklist, {
          defaultSeverity: thresholds.defaultSeverity,
          diagnose: settings.diagnose,
          failOn: thresholds.failOn,
          pragmaLedger,
          provenance: entry.provenance,
        });
        if (!report.passed) allPassed = false;
        yield {
          kind: 'checklistReported',
          checklist,
          entry,
          report,
          warnings: listMaskedSkipWarnings(entry, checklist.name, report.diagnoses),
        };
      }

      yield { kind: 'kitFinished', entry };
    } catch (error: unknown) {
      failedKitCount++;
      yield {
        kind: 'kitFailed',
        entry,
        error: toRdyError(error),
        reason: 'failedAfterLoad',
        warnings: pendingWarnings,
      };
    }
  }

  const runWarnings = [
    ...dependencies.listUnusedPragmaWarnings(pragmaLedger),
    ...(await dependencies.listUnmarkedGeneratedSourceWarnings(pragmaLedger)),
    ...listUnrunSourceWarnings(settings.unrunSources),
  ];
  yield { kind: 'runFinished', allPassed, failedKitCount, warnings: runWarnings };
}
