import { DEFAULT_MANIFEST_PATH } from 'readyup';
import type { CheckOutcome, RdyCheck } from 'readyup';
import { computeHash, readFile } from 'readyup/check-utils';

import type { ManifestEntry } from './kit-layout.ts';
import { listCompiledBundlePaths, readManifestEntries, resolveRecordedPath } from './kit-layout.ts';

/** Number of hex characters `rdy compile` records for a source or bundle hash. */
const HASH_PREFIX_LENGTH = 8;

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
        name: 'its source is unchanged since it was compiled',
        check: () => compareToRecordedHash(entry.source, entry.sourceHash),
        fix: `Run 'rdy compile' to rebuild ${entry.name} from its source`,
      },
      {
        name: 'its bundle is unchanged since it was compiled',
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
    name: 'every compiled kit is recorded in the manifest',
    skip: () => (listCompiledBundlePaths().length === 0 ? 'nothing compiled' : false),
    check: () => ({ ok: false, detail: `${DEFAULT_MANIFEST_PATH} records no kit` }),
    fix: `Run 'rdy compile' to record every compiled kit and its hashes`,
  };
}

/** Compares a file the manifest names against the hash recorded for it. */
function compareToRecordedHash(recordedPath: string | undefined, expected: string | undefined): CheckOutcome {
  if (recordedPath === undefined || expected === undefined) {
    return { ok: false, detail: 'the manifest records nothing to compare against' };
  }

  const filePath = resolveRecordedPath(recordedPath);
  const content = readFile(filePath);
  if (content === undefined) return { ok: false, detail: `${filePath} is missing` };

  const actual = computeHash(content).slice(0, HASH_PREFIX_LENGTH);
  if (actual !== expected) return { ok: false, detail: `${filePath}: expected ${expected}, got ${actual}` };

  return { ok: true, detail: filePath };
}

/** Reports which of a manifest entry's two hash records are absent. */
function describeRecordedHashes(entry: ManifestEntry): CheckOutcome {
  const unrecorded: string[] = [];
  if (entry.source === undefined || entry.sourceHash === undefined) unrecorded.push('source');
  if (entry.path === undefined || entry.targetHash === undefined) unrecorded.push('bundle');

  if (unrecorded.length === 0) return { ok: true };
  return { ok: false, detail: `no ${unrecorded.join(' or ')} hash recorded` };
}

// endregion | Helpers
