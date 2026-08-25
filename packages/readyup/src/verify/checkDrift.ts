import { existsSync } from 'node:fs';
import path from 'node:path';

import type { RdyManifestKit } from '../manifest/manifestSchema.ts';
import { hashFile } from './targetHash.ts';

/** Outcome of a per-kit drift check. */
export type DriftStatus =
  | { kind: 'ok'; targetHash: string }
  | { kind: 'drift'; expected: string; actual: string; resolvedPath: string }
  | { kind: 'missing'; resolvedPath: string }
  | { kind: 'unverified' };

/**
 * Returns whether a kit's on-disk compiled file matches the manifest's recorded `targetHash`.
 *
 * `unverified` where the manifest entry has no hash, which means it predates the feature or was
 * written with `--skip-manifest`; `missing` where the compiled file does not exist; `drift` where the
 * hashes differ; and `ok` where they match.
 */
export function checkDrift(kit: RdyManifestKit, manifestDir: string): DriftStatus {
  if (kit.targetHash === undefined || kit.path === undefined) {
    return { kind: 'unverified' };
  }

  const resolvedPath = path.resolve(manifestDir, kit.path);

  if (!existsSync(resolvedPath)) {
    return { kind: 'missing', resolvedPath };
  }

  const actual = hashFile(resolvedPath);
  if (actual !== kit.targetHash) {
    return { kind: 'drift', expected: kit.targetHash, actual, resolvedPath };
  }

  return { kind: 'ok', targetHash: actual };
}
