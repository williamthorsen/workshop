import { DEFAULT_MANIFEST_PATH } from 'readyup';
import type { CheckOutcome, RdyCheck } from 'readyup';
import { computeHash, readFile } from 'readyup/check-utils';

import type { ManifestEntry } from './kit-layout.ts';
import { readManifestEntries, resolveRecordedPath, skipWithoutBundles } from './kit-layout.ts';

/**
 * Checks asserting that every kit the manifest records still matches the hashes recorded for it.
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

  const actual = computeHash(content).slice(0, expected.length);
  if (actual !== expected) {
    return { ok: false, detail: `${filePath} hashes to ${actual}, not the recorded ${expected}` };
  }

  return { ok: true, detail: `${filePath} matches the recorded hash` };
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
