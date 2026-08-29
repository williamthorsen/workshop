import { existsSync } from 'node:fs';
import path from 'node:path';

import type { RdyManifestKit } from '../manifest/manifestSchema.ts';
import { hashFileToRecordedLength } from './targetHash.ts';

/** Outcome of a per-kit source-staleness check. */
export type SourceStatus =
  | { kind: 'ok'; sourceHash: string }
  | { kind: 'stale'; expected: string; actual: string; resolvedPath: string }
  | { kind: 'missing'; resolvedPath: string }
  | { kind: 'unverified' };

/**
 * Returns whether a kit's on-disk TypeScript source still matches the `sourceHash` the manifest
 * recorded when the kit was compiled.
 *
 * `unverified` where the entry records no source or no hash, which means it predates the feature or
 * was written with `--skip-manifest`; `missing` where the recorded source is gone; `stale` where the
 * hashes differ; and `ok` where they match. This is orthogonal to the target verdict: a kit can be
 * stale at the source and drifted at the target at once, and neither verdict implies the other.
 */
export function checkSourceDrift(kit: RdyManifestKit, manifestDir: string): SourceStatus {
  if (kit.sourceHash === undefined || kit.source === undefined) {
    return { kind: 'unverified' };
  }

  const resolvedPath = path.resolve(manifestDir, kit.source);

  if (!existsSync(resolvedPath)) {
    return { kind: 'missing', resolvedPath };
  }

  const actual = hashFileToRecordedLength(resolvedPath, kit.sourceHash);
  if (actual !== kit.sourceHash) {
    return { kind: 'stale', expected: kit.sourceHash, actual, resolvedPath };
  }

  return { kind: 'ok', sourceHash: actual };
}
