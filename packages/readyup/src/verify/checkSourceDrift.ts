import { existsSync } from 'node:fs';
import path from 'node:path';

import type { RdyManifestKit } from '../manifest/manifestSchema.ts';
import { hashFile } from './targetHash.ts';

/** Outcome of a per-kit source-staleness check. */
export type SourceStatus =
  | { kind: 'ok'; sourceHash: string }
  | { kind: 'stale'; expected: string; actual: string; resolvedPath: string }
  | { kind: 'missing'; resolvedPath: string }
  | { kind: 'unverified' };

/**
 * Determine whether a kit's on-disk TypeScript source still matches the `sourceHash` the manifest
 * recorded when the kit was compiled.
 *
 * Orthogonal to the target verdict: a kit can be stale at the source and drifted at the target at
 * the same time, and neither verdict implies the other. Returns `unverified` when the entry records
 * no source or no hash (it predates the feature, or was written with `--skip-manifest`), `missing`
 * when the recorded source is gone, `stale` when the hashes differ, and `ok` when they match.
 */
export function checkSourceDrift(kit: RdyManifestKit, manifestDir: string): SourceStatus {
  if (kit.sourceHash === undefined || kit.source === undefined) {
    return { kind: 'unverified' };
  }

  const resolvedPath = path.resolve(manifestDir, kit.source);

  if (!existsSync(resolvedPath)) {
    return { kind: 'missing', resolvedPath };
  }

  const actual = hashFile(resolvedPath);
  if (actual !== kit.sourceHash) {
    return { kind: 'stale', expected: kit.sourceHash, actual, resolvedPath };
  }

  return { kind: 'ok', sourceHash: actual };
}
