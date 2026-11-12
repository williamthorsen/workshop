import { type Move, type MovePlan, planMove } from '../move/move-plan.ts';
import { settleMove } from '../move/settle-move.ts';
import { expandTilde, formatDisplayPath } from '../portable/paths.ts';
import { findReferences } from '../references/find-references.ts';
import type { RegistryEntry } from '../registry/registry.ts';
import { formatEntryName, PROG, type VerbRun } from './verb-run.ts';

/**
 * Lists a clone's worktrees and plans its move, or returns the last refusal as a message after reporting the others on
 * stderr.
 */
export function planCloneMove(run: VerbRun, from: string, to: string): MovePlan | string {
  const worktrees = run.adapters.listWorktrees(from);
  if (typeof worktrees === 'string') return `cannot list the worktrees of ${from}: ${worktrees}`;
  const plan = planMove({ from, to }, worktrees, run.adapters);
  if (!Array.isArray(plan)) return plan;
  const earlier = plan.slice(0, -1);
  for (const refusal of earlier) run.stderr(`${PROG}: ${refusal}`);
  return plan.at(-1) ?? 'the move is refused';
}

/** Prints a planned or completed rename as `<from> -> <to>`, each path in its `~` form. */
export function printMove(run: VerbRun, move: Move, isDryRun: boolean): void {
  const line = `${formatDisplayPath(move.from, run.home)} -> ${formatDisplayPath(move.to, run.home)}`;
  run.stdout(isDryRun ? `would move ${line}` : line);
}

/**
 * Prints each reference to the old paths in the tracked files of the registered clones present on this machine and
 * under the search paths, one per line, and reports on stderr each clone or path that could not be searched. An entry
 * in `locations` is searched at the directory that it maps to, in place of its `path`.
 */
export function printReferences(
  run: VerbRun,
  oldPaths: readonly string[],
  entries: readonly RegistryEntry[],
  searchPaths: readonly string[],
  locations: ReadonlyMap<RegistryEntry, string> = new Map(),
): void {
  const clones = entries
    .map((entry) => ({
      dir: locations.get(entry) ?? expandTilde(entry.path ?? '', run.home),
      label: formatEntryName(entry),
    }))
    .filter((clone) => clone.dir !== '' && run.adapters.isDirectory(clone.dir));
  const report = findReferences(oldPaths, clones, searchPaths, run.home);
  for (const problem of report.problems) run.stderr(`${PROG}: ${problem}`);
  for (const reference of report.references) {
    run.stdout(
      reference.line === undefined
        ? `${reference.location}: ${reference.file} ${reference.text}`
        : `${reference.location}: ${reference.file}:${reference.line}: ${reference.text}`,
    );
  }
  if (report.references.length > 0) {
    run.stderr(`${PROG}: ${report.references.length} remaining references to the old paths`);
  }
}

/**
 * Settles what the moves left behind, given the worktrees that moved and the top-level renames, and prints each action
 * on stdout and each problem on stderr.
 */
export function printSettlement(
  run: VerbRun,
  relocated: readonly Move[],
  moves: readonly Move[],
  isDryRun: boolean,
): void {
  const lines = settleMove(relocated, moves, {
    adapters: run.adapters,
    home: run.home,
    isDryRun,
    sessionsDir: run.sessionsDir,
  });
  for (const line of lines) {
    if (line.stream === 'stdout') run.stdout(line.text);
    else run.stderr(`${PROG}: ${line.text}`);
  }
}

/** Reports on stderr each worktree that git lists but that is missing from disk, and that the move skips. */
export function reportSkippedWorktrees(run: VerbRun, skipped: readonly string[]): void {
  for (const worktree of skipped) {
    run.stderr(`${PROG}: ${formatDisplayPath(worktree, run.home)} is missing; run git worktree prune to drop it`);
  }
}
