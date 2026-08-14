import { existsSync } from 'node:fs';
import path from 'node:path';

import { describeJsonProjectionFailure } from '../compile/JsonProjectionError.ts';
import { projectJsonFile } from '../compile/projectJsonFile.ts';
import type { RdyManifestInput, RdyManifestKit } from '../manifest/manifestSchema.ts';
import { hashFile, hashProjection } from './targetHash.ts';

/**
 * One recorded input that no longer matches what the compile read, and why.
 *
 * `changed` and `missing` describe either kind of input. `unprojectable` is inline-only: the file is
 * present and the fields the kit pinned to are not, which says something different about the kit than a
 * hash that moved and so is reported apart from one.
 *
 * `path` is the input as the manifest records it, relative to the manifest directory.
 */
export type InputFailure =
  | { kind: 'inline' | 'module'; path: string; reason: 'changed'; expected: string; actual: string }
  | { kind: 'inline' | 'module'; path: string; reason: 'missing' }
  | { kind: 'inline'; path: string; reason: 'unprojectable'; detail: string };

/** Outcome of a per-kit input-closure check. */
export type InputsStatus = { kind: 'ok' } | { kind: 'stale'; failures: InputFailure[] } | { kind: 'unverified' };

/**
 * Determines whether everything a kit's compile read still matches what the manifest recorded for it.
 *
 * The axis the two hash verdicts leave uncovered: a bundle is a function of every module it inlined and
 * every JSON projection `pickJson` substituted, none of which `sourceHash` or `targetHash` describes.
 *
 * Reports every input that failed rather than the first, so one pass names everything to fix. Returns
 * `unverified` when the entry records no `inputs`, which means it predates the closure and says nothing
 * about whether the kit is stale.
 */
export function checkInputDrift(kit: RdyManifestKit, manifestDir: string): InputsStatus {
  if (kit.inputs === undefined) return { kind: 'unverified' };

  const failures = kit.inputs
    .map((input) => checkInput(input, manifestDir))
    .filter((failure): failure is InputFailure => failure !== undefined);

  return failures.length === 0 ? { kind: 'ok' } : { kind: 'stale', failures };
}

// region | Helpers

/** Returns what is wrong with one recorded input, or nothing when it still matches. */
function checkInput(input: RdyManifestInput, manifestDir: string): InputFailure | undefined {
  const resolvedPath = path.resolve(manifestDir, input.path);
  if (!existsSync(resolvedPath)) {
    return { kind: input.kind, path: input.path, reason: 'missing' };
  }

  if (input.kind === 'module') {
    const actual = hashFile(resolvedPath);
    if (actual === input.hash) return undefined;
    return { kind: 'module', path: input.path, reason: 'changed', expected: input.hash, actual };
  }

  let actual: string;
  try {
    actual = hashProjection(projectJsonFile(resolvedPath, input.paths));
  } catch (error: unknown) {
    return { kind: 'inline', path: input.path, reason: 'unprojectable', detail: describeJsonProjectionFailure(error) };
  }

  if (actual === input.hash) return undefined;
  return { kind: 'inline', path: input.path, reason: 'changed', expected: input.hash, actual };
}

// endregion | Helpers
