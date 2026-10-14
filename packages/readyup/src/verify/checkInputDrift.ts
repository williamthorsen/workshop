import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

import { hashToRecordedLength } from '../check-utils/hashing.ts';
import { describeJsonProjectionFailure } from '../compile/JsonProjectionError.ts';
import { projectJsonFile } from '../compile/projectJsonFile.ts';
import type { RdyManifestInput, RdyManifestKit } from '../manifest/manifestSchema.ts';
import { hashFileToRecordedLength } from './targetHash.ts';

/**
 * One recorded input that no longer matches what the compile read, and why.
 *
 * `changed` and `missing` describe either kind of input. `unprojectable` is inline-only: The file is
 * present and the fields that the kit pinned to are not, which says something different about the kit
 * than a hash that moved and so is reported apart from one.
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
 * The axis left uncovered by the two hash verdicts: A bundle is a function of every module that it
 * inlined and every JSON projection that `pickJson` substituted, none of which `sourceHash` or
 * `targetHash` describes.
 *
 * The closure records the kit's own source too, and that file is judged by the source axis alone, so an
 * edit to it is reported once. Reports every input that failed rather than the first, so one pass names
 * everything to fix. Returns `unverified` when the entry records no `inputs`, which means it predates the
 * closure and says nothing about whether the kit is stale.
 */
export function checkInputDrift(kit: RdyManifestKit, manifestDir: string): InputsStatus {
  if (kit.inputs === undefined) return { kind: 'unverified' };

  const sourcePath = kit.source === undefined ? undefined : path.resolve(manifestDir, kit.source);
  const failures = kit.inputs
    .filter((input) => sourcePath === undefined || !isSameFile(path.resolve(manifestDir, input.path), sourcePath))
    .map((input) => checkInput(input, manifestDir))
    .filter((failure): failure is InputFailure => failure !== undefined);

  return failures.length === 0 ? { kind: 'ok' } : { kind: 'stale', failures };
}

// region | Helpers

/** Returns what is wrong with one recorded input, or `undefined` when it still matches. */
function checkInput(input: RdyManifestInput, manifestDir: string): InputFailure | undefined {
  const resolvedPath = path.resolve(manifestDir, input.path);
  if (!existsSync(resolvedPath)) {
    return { kind: input.kind, path: input.path, reason: 'missing' };
  }

  if (input.kind === 'module') {
    const actual = hashFileToRecordedLength(resolvedPath, input.hash);
    if (actual === input.hash) return undefined;
    return { kind: 'module', path: input.path, reason: 'changed', expected: input.hash, actual };
  }

  let actual: string;
  try {
    actual = hashToRecordedLength(projectJsonFile(resolvedPath, input.paths), input.hash);
  } catch (error: unknown) {
    return { kind: 'inline', path: input.path, reason: 'unprojectable', detail: describeJsonProjectionFailure(error) };
  }

  if (actual === input.hash) return undefined;
  return { kind: 'inline', path: input.path, reason: 'changed', expected: input.hash, actual };
}

/**
 * Reports whether two resolved paths name the same file.
 *
 * Compares real paths, because the compile records an input at the path to which esbuild resolved it,
 * which differs from the recorded `source` wherever a directory above it is a symlink.
 */
function isSameFile(firstPath: string, secondPath: string): boolean {
  return firstPath === secondPath || resolveRealPath(firstPath) === resolveRealPath(secondPath);
}

/**
 * Returns the real path of a file, resolving its directory alone when the file is gone, so that a deleted
 * file still matches its recorded counterpart. Returns the path unchanged when its directory is gone too.
 */
function resolveRealPath(filePath: string): string {
  if (existsSync(filePath)) return realpathSync(filePath);
  const directory = path.dirname(filePath);
  return existsSync(directory) ? path.join(realpathSync(directory), path.basename(filePath)) : filePath;
}

// endregion | Helpers
