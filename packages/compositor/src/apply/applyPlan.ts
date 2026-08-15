import { mkdir, readFile, rm, rmdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { decodeBlob } from '../portable/decodeBlob.ts';
import { expandPath } from '../portable/expandPath.ts';
import { hashBytes } from '../portable/hash-content.ts';
import { isMissingFile } from '../portable/isMissingFile.ts';
import type { Blob, FileEntry } from '../schemas/file-schemas.ts';
import type { Plan } from '../schemas/plan-schemas.ts';
import type { Hash, TargetId } from '../schemas/scalar-schemas.ts';
import type { AppliedFile, ApplyOutcome, FileAction, PrunedDirectory } from './ApplyOutcome.ts';
import { assertPlanIsApplicable } from './assertPlanIsApplicable.ts';
import { collectPrunableDirs } from './collectPrunableDirs.ts';

/** What applying a plan needs beyond the plan itself. */
export interface ApplyPlanOptions {
  /** Anchors a target root declared as a relative path. */
  readonly baseDir: string;
  /** Writes over a destination that moved after the plan was composed. Never overrides a block. */
  readonly force?: boolean | undefined;
  /** Decides every action and writes none of them. */
  readonly dryRun?: boolean | undefined;
}

/**
 * Writes a plan to the destinations it was composed for, and takes away what it no longer plans.
 *
 * Idempotent by construction rather than by a pass that checks afterwards: each destination is compared against both
 * of the plan's sides. One already holding the planned body has nothing to do, one holding the body the plan recorded
 * as current is written, and one holding neither has moved since the plan was composed and is passed over. So a second
 * apply finds the planned body everywhere the first one wrote, and an empty plan touches nothing.
 *
 * Every destination is read, one the plan calls unchanged included, so a file that moved after the plan was composed
 * reports as drift rather than as a quiet success. Nothing is written for it either way.
 *
 * `force` writes over drift. It never overrides a block, which is a destination whose content the plan could not
 * compute or whose provenance is undecidable from shape, and no flag makes either decidable. `dryRun` runs the
 * identical walk and writes nothing.
 *
 * A region host is written whole, its planned body being the host with the owned region injected into it, so an edit
 * elsewhere in that host reads as drift like any other. The plan shows the bytes that will be written, and a host's own
 * content is among the inputs the fingerprint covers precisely because planned content is derived from it: a moved host
 * is what capturing afresh answers.
 *
 * Removal takes away the directory it empties, bounded by the container directories the target names. A target naming
 * none, which an older plan is, has the climb unbounded and keeps every directory it holds.
 */
export async function applyPlan(plan: Plan, options: ApplyPlanOptions): Promise<ApplyOutcome> {
  assertPlanIsApplicable(plan);

  const dryRun = options.dryRun === true;
  const force = options.force === true;
  const roots = new Map(plan.targets.map((target) => [target.id, expandPath(target.root, options.baseDir)]));

  const files: Array<AppliedFile> = [];
  const touched = new Map<TargetId, TouchedPaths>();

  for (const file of plan.files) {
    const root = requireRoot(roots, file);
    const applied = await applyFile({ blobs: plan.blobs, dryRun, file, force, root });
    files.push(applied);

    if (applied.action === 'removed' || applied.action === 'written') {
      const paths = touched.get(file.targetId) ?? { removed: new Set<string>(), written: new Set<string>() };
      paths[applied.action === 'removed' ? 'removed' : 'written'].add(file.path);
      touched.set(file.targetId, paths);
    }
  }

  return { fingerprint: plan.fingerprint, dryRun, files, prunedDirs: await pruneEmptied(plan, roots, touched, dryRun) };
}

// region | Helpers

/** Brings one destination to what the plan says it should hold, or reports why it was left as it is. */
async function applyFile(input: ApplyFileInput): Promise<AppliedFile> {
  const { blobs, dryRun, file, force, root } = input;
  const destination = path.join(root, file.path);
  const held = await hashIfPresent(destination);

  if (file.blocked !== undefined) {
    return recordFile(file, 'skipped-blocked', held, file.blocked.reason);
  }

  if (file.planned === undefined) {
    if (held === undefined) {
      return recordFile(file, 'unchanged', undefined);
    }
    if (held !== file.current?.hash && !force) {
      return recordFile(file, 'skipped-drifted', held, describeDrift(file, held));
    }
    if (!dryRun) {
      await rm(destination);
    }
    return recordFile(file, 'removed', undefined);
  }

  if (held === file.planned.hash) {
    return recordFile(file, 'unchanged', held);
  }
  if (held !== file.current?.hash && !force) {
    return recordFile(file, 'skipped-drifted', held, describeDrift(file, held));
  }

  const body = requireBody(blobs, file);
  if (!dryRun) {
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, body);
  }
  return recordFile(file, 'written', file.planned.hash);
}

/** What applying one of a plan's files needs. */
interface ApplyFileInput {
  readonly blobs: Record<Hash, Blob>;
  readonly dryRun: boolean;
  readonly file: FileEntry;
  readonly force: boolean;
  readonly root: string;
}

/** States what a destination holds against what the plan recorded of it. */
function describeDrift(file: FileEntry, held: Hash | undefined): string {
  const recorded = file.current === undefined ? 'nothing' : `"${file.current.hash}"`;
  const holds = held === undefined ? 'nothing' : `"${held}"`;

  return `The destination holds ${holds} where the plan recorded ${recorded}, so it moved after the plan was composed.`;
}

/** Hashes what a destination holds, or reports that it holds nothing. */
async function hashIfPresent(destination: string): Promise<Hash | undefined> {
  try {
    return hashBytes(await readFile(destination));
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }
}

/** Reports whether `error` means the directory still holds something. */
function isPopulatedDir(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  return error.code === 'ENOTEMPTY' || error.code === 'EEXIST';
}

/** Takes away every directory the run's removals emptied, target by target and deepest first. */
async function pruneEmptied(
  plan: Plan,
  roots: ReadonlyMap<TargetId, string>,
  touched: ReadonlyMap<TargetId, TouchedPaths>,
  dryRun: boolean,
): Promise<Array<PrunedDirectory>> {
  const pruned: Array<PrunedDirectory> = [];

  for (const target of plan.targets) {
    const root = roots.get(target.id);
    const paths = touched.get(target.id);
    // A target stating no container directories leaves the climb unbounded, so every directory it holds stands.
    if (root === undefined || paths === undefined || target.containerDirs === undefined) {
      continue;
    }

    const dirs = await collectPrunableDirs({
      root,
      removed: paths.removed,
      written: paths.written,
      containerDirs: new Set(target.containerDirs),
    });
    for (const dir of dirs) {
      if (dryRun || (await removeDir(path.join(root, dir)))) {
        pruned.push({ targetId: target.id, path: dir });
      }
    }
  }

  return pruned;
}

/** Builds the record one destination leaves behind. */
function recordFile(file: FileEntry, action: FileAction, hash: Hash | undefined, reason?: string): AppliedFile {
  return {
    targetId: file.targetId,
    path: file.path,
    action,
    ...(hash !== undefined && { hash }),
    ...(reason !== undefined && { reason }),
  };
}

/** Removes an emptied directory, reporting whether it went: something may have landed in it since it was listed. */
async function removeDir(dir: string): Promise<boolean> {
  try {
    await rmdir(dir);
    return true;
  } catch (error: unknown) {
    if (isMissingFile(error) || isPopulatedDir(error)) {
      return false;
    }
    throw error;
  }
}

/** Decodes the body a file's planned side names, which the pre-flight has established the plan holds. */
function requireBody(blobs: Record<Hash, Blob>, file: FileEntry): Uint8Array {
  const hash = file.planned?.hash;
  const blob = hash === undefined ? undefined : blobs[hash];
  if (blob === undefined) {
    throw new Error(`Plan holds no body "${hash}" for "${file.path}" at target "${file.targetId}".`);
  }
  return decodeBlob(blob);
}

/** Reads the root a file's target resolves to, which the pre-flight has established the plan carries. */
function requireRoot(roots: ReadonlyMap<TargetId, string>, file: FileEntry): string {
  const root = roots.get(file.targetId);
  if (root === undefined) {
    throw new Error(`Plan carries no target "${file.targetId}", which "${file.path}" is deployed to.`);
  }
  return root;
}

/** The destinations one target's run acted on, which decide which of its directories are left empty. */
interface TouchedPaths {
  readonly removed: Set<string>;
  readonly written: Set<string>;
}

// endregion | Helpers
