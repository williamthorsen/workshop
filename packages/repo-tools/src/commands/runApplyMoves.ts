import { serializeReadout } from '@williamthorsen/readout';
import { describeInvalidOutputStyle, resolveOutputStyle } from '@williamthorsen/toolbelt.terminal/candidate';

import { executeMove } from '../move/move-clone.ts';
import type { Move, MovePlan } from '../move/move-plan.ts';
import { settleMove } from '../move/settle-move.ts';
import { formatDisplayPath, normalizePath } from '../portable/paths.ts';
import { findPathClaimant, readRegistry, type RegistryEntry } from '../registry/registry.ts';
import { type ApplyMovesResult, deriveApplyMovesStatus, type EntryOutcome } from './apply-moves-result.ts';
import { collectReferences, type MoveOptions, planCloneMove } from './move-report.ts';
import { renderApplyMovesLines } from './render-apply-moves.ts';
import { findUnexpandablePath, formatEntryName, parseRemoteUrl, reportFailure, type VerbRun } from './verb-run.ts';

/** The environment variable that sets the output style (`auto`, `plain`, or `rich`) in place of detection. */
export const OUTPUT_STYLE_VARIABLE = 'THOR_REPO_OUTPUT_STYLE';

/**
 * Moves each clone found at one of its entry's `formerPaths`, while the entry's `path` is absent, to that path with its
 * worktrees, settles what the moves left behind, and searches for the remaining references to the old paths. Does not
 * write the registry or any stream. Returns the failure when the registry cannot be read or a path cannot be expanded.
 */
export function applyMoves(run: VerbRun, options: MoveOptions): ApplyMovesResult | string {
  const registry = readRegistry(run.file);
  if (typeof registry === 'string') return registry;
  const unexpandable = findUnexpandablePath(run, registry.entries, options.searchPaths);
  if (unexpandable !== undefined) return unexpandable;

  const entries: EntryOutcome[] = [];
  // Each planned entry's plan, with the index of its outcome in `entries`.
  const plans = new Map<RegistryEntry, { index: number; plan: MovePlan }>();
  for (const entry of registry.entries) {
    const { ignoredFormerPaths, plan } = planEntry(run, entry, registry.entries);
    const outcome = buildOutcome(entry, ignoredFormerPaths);
    if (Array.isArray(plan)) {
      entries.push({ ...outcome, reasons: plan, status: 'blocked' });
    } else if (plan === undefined) {
      if (ignoredFormerPaths.length > 0) entries.push(outcome);
    } else {
      plans.set(entry, { index: entries.length, plan });
      entries.push({ ...outcome, missingWorktrees: plan.skippedWorktrees, moves: plan.moves, status: 'planned' });
    }
  }

  const relocatedWorktrees: Move[] = [];
  const moves: Move[] = [];
  for (const { index, plan } of plans.values()) {
    if (options.isDryRun) {
      relocatedWorktrees.push(...plan.relocatedWorktrees);
      moves.push(...plan.moves);
      continue;
    }
    const outcome = executeMove(plan, run.adapters);
    relocatedWorktrees.push(...outcome.relocatedWorktrees);
    moves.push(...outcome.completedMoves);
    const planned = entries[index];
    if (planned === undefined) continue;
    entries[index] =
      outcome.failure === undefined
        ? { ...planned, moves: outcome.completedMoves, status: 'moved' }
        : {
            ...planned,
            moves: outcome.completedMoves,
            notMoved: outcome.remainingMoves,
            reasons: [outcome.failure],
            status: 'failed',
          };
  }
  // Settle once over every plan, so that clones leaving one parent leave it empty in a dry run's report too.
  const settlement = settleMove(relocatedWorktrees, moves, {
    adapters: run.adapters,
    home: run.home,
    isDryRun: options.isDryRun,
    sessionsDir: run.sessionsDir,
  });
  // Until the moves run, each moved entry's clone is still at the source of its plan.
  const locations = options.isDryRun
    ? new Map([...plans].map(([entry, { plan }]) => [entry, plan.primary.from]))
    : new Map<RegistryEntry, string>();
  const report =
    moves.length === 0
      ? { problems: [], references: [] }
      : collectReferences(
          run,
          moves.map((move) => move.from),
          registry.entries,
          options.searchPaths,
          locations,
        );
  return {
    entries,
    isDryRun: options.isDryRun,
    problems: report.problems,
    references: report.references,
    settlement,
  };
}

/**
 * Runs `apply-moves`: applies the moves, then prints the result as status lines, or as JSON under `--json`. Exits 1
 * when it blocked an entry or a move failed, and 2 when the output style names a style that does not exist.
 */
export function runApplyMoves(run: VerbRun, options: MoveOptions & { isJson: boolean }): number {
  const { invalid, style } = resolveOutputStyle({
    argv: [],
    env: run.env,
    envVar: OUTPUT_STYLE_VARIABLE,
    isTty: run.isStdoutTty(),
  });
  if (invalid !== undefined) {
    reportFailure(run, describeInvalidOutputStyle(invalid));
    return 2;
  }
  const result = applyMoves(run, options);
  if (typeof result === 'string') return reportFailure(run, result);

  for (const line of renderApplyMovesLines(result, style, run.home)) {
    if (line.stream === 'stderr') run.stderr(line.text);
    else if (!options.isJson) run.stdout(line.text);
  }
  if (options.isJson) run.stdout(serializeReadout({ data: result, sensitive: [] }));
  return deriveApplyMovesStatus(result);
}

// region | Helpers
/** Builds an entry's outcome before its move: `unchanged`, with the former paths that it ignored. */
function buildOutcome(entry: RegistryEntry, ignoredFormerPaths: string[]): EntryOutcome {
  return {
    entry: formatEntryName(entry),
    ignoredFormerPaths,
    missingWorktrees: [],
    moves: [],
    notMoved: [],
    reasons: [],
    status: 'unchanged',
  };
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

/**
 * Plans the move of an entry's clone from a former path to its path, returning the plan, `undefined` when there is
 * nothing to move, or the refusals that block the entry, with the former paths that it ignored. A former path counts
 * only when it is the root of a clone whose origin, when the entry has a `repo`, is that repo. An entry whose path
 * another entry also names is blocked.
 */
function planEntry(
  run: VerbRun,
  entry: RegistryEntry,
  entries: readonly RegistryEntry[],
): { ignoredFormerPaths: string[]; plan: MovePlan | string[] | undefined } {
  const ignoredFormerPaths: string[] = [];
  if (entry.path === undefined || entry.formerPaths.length === 0) return { ignoredFormerPaths, plan: undefined };
  const to = normalizePath(entry.path, run.home);
  const presentFormerPaths = entry.formerPaths
    .map((formerPath) => normalizePath(formerPath, run.home))
    .filter((formerPath) => run.adapters.isDirectory(formerPath))
    .map((formerPath) => run.adapters.resolvePath(formerPath));
  if (run.adapters.pathExists(to)) {
    const plan =
      presentFormerPaths.length === 0
        ? undefined
        : [`both ${entry.path} and a former path, ${display(run, presentFormerPaths)}, exist`];
    return { ignoredFormerPaths, plan };
  }

  const candidates = presentFormerPaths.filter((formerPath) => {
    const isClone = isCloneOf(run, formerPath, entry.repo);
    if (!isClone) ignoredFormerPaths.push(formerPath);
    return isClone;
  });
  const claimant = findPathClaimant(entries, entry, to, run.home);
  if (claimant !== undefined && candidates.length > 0) {
    return { ignoredFormerPaths, plan: [`its path, ${entry.path}, is also the path of ${formatEntryName(claimant)}`] };
  }
  if (candidates.length > 1) {
    return { ignoredFormerPaths, plan: [`more than one former path holds its clone: ${display(run, candidates)}`] };
  }
  const [from] = candidates;
  if (from === undefined) return { ignoredFormerPaths, plan: undefined };
  return { ignoredFormerPaths, plan: planCloneMove(run, from, to) };
}
// endregion | Helpers
