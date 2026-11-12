import { executeMove } from '../move/move-clone.ts';
import type { MovePlan } from '../move/move-plan.ts';
import { formatDisplayPath, normalizePath } from '../portable/paths.ts';
import { readRegistry, type RegistryEntry } from '../registry/registry.ts';
import { planCloneMove, printMove, printReferences, reportSkippedWorktrees } from './move-report.ts';
import type { MoveOptions } from './runMove.ts';
import { formatEntryName, parseRemoteUrl, PROG, reportFailure, type VerbRun } from './verb-run.ts';

/**
 * Runs `apply-moves`: moves each clone found at one of its entry's `formerPaths`, while the entry's `path` is absent,
 * to that path with its worktrees, then reports the remaining references to the old paths. Does not write the
 * registry. Exits 1 when it skipped an entry or a move failed.
 */
export function runApplyMoves(run: VerbRun, options: MoveOptions): number {
  const registry = readRegistry(run.file);
  if (typeof registry === 'string') return reportFailure(run, registry);

  const plans = new Map<RegistryEntry, MovePlan>();
  let isClean = true;
  for (const entry of registry.entries) {
    const plan = planEntry(run, entry, registry.entries);
    if (typeof plan === 'string') {
      run.stderr(`${PROG}: ${formatEntryName(entry)}: ${plan}; skipped`);
      isClean = false;
    } else if (plan !== undefined) {
      plans.set(entry, plan);
    }
  }
  if (plans.size === 0) {
    run.stderr(`${PROG}: nothing to move`);
    return isClean ? 0 : 1;
  }

  const oldPaths: string[] = [];
  for (const plan of plans.values()) {
    reportSkippedWorktrees(run, plan.skipped);
    if (options.isDryRun) {
      for (const move of plan.moves) printMove(run, move, true);
      oldPaths.push(...plan.moves.map((move) => move.from));
      continue;
    }
    const outcome = executeMove(plan, run.adapters);
    for (const move of outcome.completed) printMove(run, move, false);
    oldPaths.push(...outcome.completed.map((move) => move.from));
    if (outcome.failure === undefined) {
      continue;
    }

    for (const move of outcome.remaining) {
      run.stderr(`${PROG}: not moved: ${formatDisplayPath(move.from, run.home)}`);
    }
    run.stderr(`${PROG}: ${outcome.failure}`);
    isClean = false;
  }
  // Until the moves run, each moved entry's clone is still at the source of its plan.
  const locations = options.isDryRun
    ? new Map([...plans].map(([entry, plan]) => [entry, plan.primary.from]))
    : new Map<RegistryEntry, string>();
  printReferences(run, oldPaths, registry.entries, options.searchPaths, locations);
  if (options.isDryRun) run.stderr(`${PROG}: nothing moved; run without --dry-run to apply the moves`);
  return isClean ? 0 : 1;
}

// region | Helpers

/**
 * Plans the move of an entry's clone from a former path to its path, or returns `undefined` when there is nothing to
 * move, or a message naming why the entry is skipped. A former path counts only when it is the root of a clone whose
 * origin, when the entry has a `repo`, is that repo; another one is reported and ignored. An entry whose path another
 * entry also names is skipped.
 */
function planEntry(
  run: VerbRun,
  entry: RegistryEntry,
  entries: readonly RegistryEntry[],
): MovePlan | string | undefined {
  if (entry.path === undefined || entry.formerPaths.length === 0) return undefined;
  const to = normalizePath(entry.path, run.home);
  const present = entry.formerPaths
    .map((formerPath) => normalizePath(formerPath, run.home))
    .filter((formerPath) => run.adapters.isDirectory(formerPath))
    .map((formerPath) => run.adapters.resolvePath(formerPath));
  if (run.adapters.pathExists(to)) {
    return present.length === 0 ? undefined : `both ${entry.path} and a former path, ${display(run, present)}, exist`;
  }

  const candidates = present.filter((formerPath) => {
    const isClone = isCloneOf(run, formerPath, entry.repo);
    if (!isClone) {
      run.stderr(`${PROG}: ${formatEntryName(entry)}: ignored ${display(run, [formerPath])}, which is not its clone`);
    }
    return isClone;
  });
  const claimant = entries.find(
    (other) => other !== entry && other.path !== undefined && normalizePath(other.path, run.home) === to,
  );
  if (claimant !== undefined && candidates.length > 0) {
    return `its path, ${entry.path}, is also the path of ${formatEntryName(claimant)}`;
  }
  if (candidates.length > 1) return `more than one former path holds its clone: ${display(run, candidates)}`;
  const [from] = candidates;
  if (from === undefined) return undefined;
  return planCloneMove(run, from, to);
}

/** Joins paths in their `~` form. */
function display(run: VerbRun, paths: readonly string[]): string {
  return paths.map((value) => formatDisplayPath(value, run.home)).join(', ');
}

/** Reports whether a directory is the root of a clone whose origin, when `repo` is given, is that GitHub repo. */
function isCloneOf(run: VerbRun, dir: string, repo: string | undefined): boolean {
  if (run.adapters.readCloneRoot(dir) !== dir) return false;
  if (repo === undefined) return true;
  const origin = run.adapters.readOriginUrl(dir);
  return origin !== undefined && parseRemoteUrl(origin)?.path === repo;
}

// endregion | Helpers
