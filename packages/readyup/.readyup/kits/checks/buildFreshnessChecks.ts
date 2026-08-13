import { DEFAULT_MANIFEST_PATH } from 'readyup';
import type { CheckOutcome, FractionProgress, RdyCheck } from 'readyup';
import { computeHash, describeJsonProjectionFailure, fileExists, projectJsonFile, readFile } from 'readyup/check-utils';

import type { ManifestEntry, ManifestInput } from './kit-layout.ts';
import { readManifestEntries, resolveRecordedPath, skipWithoutBundles } from './kit-layout.ts';

/** Detail reported by a check that stands down for an entry compiled before readyup recorded a closure. */
const NO_INPUTS_REASON = 'The manifest records no inputs for it';

/**
 * Checks asserting that every kit the manifest records still matches what was recorded for it.
 *
 * The checks are built when the kit module is evaluated, so a drifted kit is named on its own line
 * rather than buried in one check's detail. Severity is left to the kit: freshness is advisory while
 * authoring and blocking while publishing, and the same checks serve both.
 */
export function buildFreshnessChecks(): RdyCheck[] {
  const entries = readManifestEntries();
  if (entries.length === 0) return [buildUnrecordedBundlesCheck()];
  return entries.map(buildEntryCheck);
}

// region | Helpers

/** Checks that one manifest entry records both hashes, with the comparisons themselves beneath it. */
function buildEntryCheck(entry: ManifestEntry): RdyCheck {
  return {
    name: `${entry.name} is recorded with a source and a bundle hash`,
    check: () => describeRecordedHashes(entry),
    fix: `Run 'rdy compile --force' to re-record ${entry.name}`,
    checks: [
      {
        name: 'Its source is unchanged since it was compiled',
        check: () => compareToRecordedHash(entry.source, entry.sourceHash),
        fix: `Run 'rdy compile' to rebuild ${entry.name} from its source`,
      },
      {
        name: 'Its bundle is unchanged since it was compiled',
        check: () => compareToRecordedHash(entry.path, entry.targetHash),
        fix: `Move the edits into the source and run 'rdy compile --force'`,
      },
      {
        // The axis the two hashes leave uncovered: a bundle is a function of every module it inlined
        // and every JSON projection substituted into it, and neither hash describes any of them.
        name: 'Everything it inlined is unchanged since it was compiled',
        skip: () => (entry.inputs === undefined ? NO_INPUTS_REASON : false),
        check: () => compareToRecordedInputs(entry.inputs ?? []),
        fix: `Run 'rdy compile' to rebuild ${entry.name} from the files it now reads`,
      },
    ],
  };
}

/**
 * The stand-in check for a project whose manifest records no kit.
 *
 * Compiling nothing is legitimate -- `rdy run --jit` runs a kit straight from its source -- so this
 * skips when the kit directory holds no bundle, and fails only on bundles the manifest cannot account for.
 */
function buildUnrecordedBundlesCheck(): RdyCheck {
  return {
    name: 'Every compiled kit is recorded in the manifest',
    skip: skipWithoutBundles,
    check: () => ({ ok: false, detail: `${DEFAULT_MANIFEST_PATH} records no kit` }),
    fix: `Run 'rdy compile' to record every compiled kit and its hashes`,
  };
}

/**
 * Compares a file the manifest names against the hash recorded for it.
 *
 * The recorded value's own length decides how much of the digest to compare, so the kit reads whatever
 * prefix `rdy compile` wrote rather than a length of its own that a later readyup could outgrow.
 */
function compareToRecordedHash(recordedPath: string | undefined, expected: string | undefined): CheckOutcome {
  if (recordedPath === undefined || expected === undefined) {
    return { ok: false, detail: 'The manifest records nothing to compare against' };
  }

  const filePath = resolveRecordedPath(recordedPath);
  const content = readFile(filePath);
  if (content === undefined) return { ok: false, detail: `${filePath} is missing` };

  const drift = describeHashDrift(filePath, content, expected, 'hashes to');
  if (drift !== undefined) return { ok: false, detail: drift };

  return { ok: true, detail: `${filePath} matches the recorded hash` };
}

/**
 * Compares everything a kit's compile read against what was recorded for it.
 *
 * Names every input that no longer matches rather than the first, so one pass names everything to fix.
 * The count stands as the evidence on a pass, since a kit records one input per file its compile read.
 */
function compareToRecordedInputs(inputs: ManifestInput[]): CheckOutcome {
  const failures = inputs.map(describeInputDrift).filter((failure) => failure !== undefined);
  const progress: FractionProgress = {
    type: 'fraction',
    passedCount: inputs.length - failures.length,
    count: inputs.length,
  };

  if (failures.length === 0) return { ok: true, progress };
  return { ok: false, detail: failures.join('; '), progress };
}

/**
 * Compares what was hashed against the hash recorded for it, and reports how it differs.
 *
 * `verb` names what the digest covers: an inline input's is over the projection substituted into the
 * bundle, not over the bytes of the file holding it.
 */
function describeHashDrift(filePath: string, hashed: string, expected: string, verb: string): string | undefined {
  const actual = computeHash(hashed).slice(0, expected.length);
  if (actual === expected) return undefined;
  return `${filePath} ${verb} ${actual}, not the recorded ${expected}`;
}

/**
 * Reports which of a recorded input's three required fields are absent.
 *
 * Leads with the path where the record carries one, so several incomplete records stay distinguishable
 * in a detail that joins them.
 */
function describeIncompleteInput(input: ManifestInput): string {
  const unrecorded: string[] = [];
  if (input.path === undefined) unrecorded.push('path');
  if (input.kind === undefined) unrecorded.push('kind');
  if (input.hash === undefined) unrecorded.push('hash');

  const absent = unrecorded.join(' or ');
  if (input.path === undefined) return `The manifest records an input with no ${absent}`;
  return `${resolveRecordedPath(input.path)} records no ${absent}`;
}

/**
 * Reports how one recorded input differs from what the compile read, or nothing when it still matches.
 *
 * An inline input is decided by the projection `rdy compile` recorded rather than by the file holding
 * it, which is what keeps an edit to a field the kit did not pick from reading as staleness. That
 * projection comes from readyup itself: once its serialization is hashed it is a format, and a second
 * implementation of it would drift from the one that wrote the hash.
 */
function describeInputDrift(input: ManifestInput): string | undefined {
  const { hash, kind, path: recordedPath, paths } = input;
  if (hash === undefined || kind === undefined || recordedPath === undefined) {
    return describeIncompleteInput(input);
  }

  const filePath = resolveRecordedPath(recordedPath);
  if (kind === 'module') {
    const content = readFile(filePath);
    if (content === undefined) return `${filePath} is missing`;
    return describeHashDrift(filePath, content, hash, 'hashes to');
  }

  if (paths === undefined) return `${filePath} records no paths to project it by`;
  if (!fileExists(filePath)) return `${filePath} is missing`;

  let projection: string;
  try {
    projection = projectJsonFile(filePath, paths);
  } catch (error: unknown) {
    return `${filePath} no longer projects (${describeJsonProjectionFailure(error)})`;
  }

  return describeHashDrift(filePath, projection, hash, 'projects to');
}

/** Reports which of a manifest entry's two hash records are absent. */
function describeRecordedHashes(entry: ManifestEntry): CheckOutcome {
  const unrecorded: string[] = [];
  if (entry.source === undefined || entry.sourceHash === undefined) unrecorded.push('source');
  if (entry.path === undefined || entry.targetHash === undefined) unrecorded.push('bundle');

  if (unrecorded.length === 0) return { ok: true };
  return { ok: false, detail: `The manifest records no ${unrecorded.join(' or ')} hash` };
}

// endregion | Helpers
