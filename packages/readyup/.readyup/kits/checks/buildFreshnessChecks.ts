import { type CheckOutcome, DEFAULT_MANIFEST_PATH, type FractionProgress, type RdyCheck } from 'readyup';
import {
  describeJsonProjectionFailure,
  fileExists,
  hashToRecordedLength,
  isRecordedHash,
  projectJsonFile,
  readFile,
} from 'readyup/check-utils';

import {
  listCompiledBundlePaths,
  type ManifestEntry,
  type ManifestInput,
  readManifestEntries,
  resolveRecordedPath,
  skipWithoutBundles,
} from './kit-layout.ts';

/** Detail reported by a check that skips an entry compiled before readyup recorded a closure. */
const NO_INPUTS_REASON = 'The manifest records no inputs for it';

/**
 * Checks asserting that every kit that the manifest records still matches what was recorded for it, and that the
 * manifest records every compiled kit.
 *
 * The checks are built when the kit module is evaluated, so a drifted kit is named on its own line
 * rather than listed in one check's detail. Severity is left to the kit: Freshness is advisory while
 * authoring and blocking while publishing, and the same checks serve both.
 */
export function buildFreshnessChecks(): RdyCheck[] {
  const entries = readManifestEntries();
  return [...entries.map(buildEntryCheck), buildUnrecordedBundlesCheck(entries)];
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
        // The axis left uncovered by the two hashes: A bundle is a function of every module that it
        // inlined and every JSON projection substituted into it, and neither hash describes any of them.
        name: 'Everything it inlined is unchanged since it was compiled',
        skip: () => (entry.inputs === undefined ? NO_INPUTS_REASON : false),
        check: () => compareToRecordedInputs(entry.inputs ?? []),
        fix: `Run 'rdy compile' to rebuild ${entry.name} from the files that it now reads`,
      },
    ],
  };
}

/**
 * Checks that the manifest records every bundle in the kit directory.
 *
 * Compiling nothing is legitimate -- `rdy run --jit` runs a kit straight from its source -- so this
 * skips when the kit directory contains no bundle. An unrecorded bundle is still loaded by `rdy run` and
 * fetched by a consumer who names it, while `rdy list` no longer names it, and a compile deletes only
 * the bundles that the manifest records.
 */
function buildUnrecordedBundlesCheck(entries: ManifestEntry[]): RdyCheck {
  return {
    name: 'Every compiled kit is recorded in the manifest',
    skip: skipWithoutBundles,
    check: () => describeUnrecordedBundles(entries),
    fix: `Delete each bundle whose kit was removed, and run 'rdy compile' to record the rest`,
  };
}

/** Compares a file named by the manifest against the hash recorded for it. */
function compareToRecordedHash(recordedPath: string | undefined, expected: string | undefined): CheckOutcome {
  if (recordedPath === undefined || expected === undefined) {
    return { ok: false, detail: 'The manifest records nothing to compare against' };
  }

  const filePath = resolveRecordedPath(recordedPath);
  if (!isRecordedHash(expected)) return { ok: false, detail: `${filePath} records ${expected}, which is not a hash` };

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
 * The count is the evidence on a pass, since a kit records one input per file read by its compile.
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
 * `verb` names what the digest covers: An inline input's is over the projection substituted into the
 * bundle, not over the contents of the file containing it.
 */
function describeHashDrift(filePath: string, hashed: string, expected: string, verb: string): string | undefined {
  const actual = hashToRecordedLength(hashed, expected);
  if (actual === expected) return undefined;
  return `${filePath} ${verb} ${actual}, not the recorded ${expected}`;
}

/**
 * Reports which of a recorded input's three required fields are absent.
 *
 * Leads with the path when the record has one, so that several incomplete records stay distinguishable
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
 * An inline input is decided by the projection that `rdy compile` recorded rather than by the file
 * containing it, so that an edit to a field that the kit did not pick does not count as staleness.
 * That projection comes from readyup itself: Once its serialization is hashed it is a format, and a
 * second implementation of it would drift from the one that wrote the hash.
 */
function describeInputDrift(input: ManifestInput): string | undefined {
  const { hash, kind, path: recordedPath, paths } = input;
  if (hash === undefined || kind === undefined || recordedPath === undefined) {
    return describeIncompleteInput(input);
  }

  const filePath = resolveRecordedPath(recordedPath);
  if (!isRecordedHash(hash)) return `${filePath} records ${hash}, which is not a hash`;

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

/** Names each bundle in the kit directory that no manifest entry records, with the recorded count as the evidence. */
function describeUnrecordedBundles(entries: ManifestEntry[]): CheckOutcome {
  const recordedPaths = new Set(
    entries.flatMap((entry) => (entry.path === undefined ? [] : [resolveRecordedPath(entry.path)])),
  );
  const bundlePaths = listCompiledBundlePaths();
  const unrecorded = bundlePaths.filter((bundlePath) => !recordedPaths.has(bundlePath));
  const progress: FractionProgress = {
    type: 'fraction',
    passedCount: bundlePaths.length - unrecorded.length,
    count: bundlePaths.length,
  };

  if (unrecorded.length === 0) return { ok: true, progress };
  return { ok: false, detail: `${DEFAULT_MANIFEST_PATH} records no entry for ${unrecorded.join(', ')}`, progress };
}

// endregion | Helpers
