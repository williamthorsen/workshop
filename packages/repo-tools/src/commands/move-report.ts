import { type Move, type MovePlan, planMove } from '../move/move-plan.ts';
import { formatSettleEvent, settleMove } from '../move/settle-move.ts';
import { expandTilde, formatDisplayPath } from '../portable/paths.ts';
import { findReferences, type Reference, type ReferenceReport } from '../references/find-references.ts';
import type { RegistryEntry } from '../registry/registry.ts';
import { formatEntryName, PROG, type VerbRun } from './verb-run.ts';

/** How a `move` or `apply-moves` run behaves. */
export interface MoveOptions {
  isDryRun: boolean;
  searchPaths: readonly string[];
}

/**
 * Searches the tracked files of the registered clones present on this machine, and the search paths, for references to
 * the old paths. An entry in `locations` is searched at the directory that it maps to, in place of its `path`.
 */
export function collectReferences(
  run: VerbRun,
  oldPaths: readonly string[],
  entries: readonly RegistryEntry[],
  searchPaths: readonly string[],
  locations: ReadonlyMap<RegistryEntry, string> = new Map(),
): ReferenceReport {
  const clones = entries
    .map((entry) => ({
      dir: locations.get(entry) ?? expandTilde(entry.path ?? '', run.home),
      label: formatEntryName(entry),
    }))
    .filter((clone) => clone.dir !== '' && run.adapters.isDirectory(clone.dir));
  return findReferences(oldPaths, clones, searchPaths, run.home);
}

/** Formats a reference as `<location>: <file>[:<line>]: <text>`. */
export function formatReference(reference: Reference): string {
  return reference.line === undefined
    ? `${reference.location}: ${reference.file} ${reference.text}`
    : `${reference.location}: ${reference.file}:${reference.line}: ${reference.text}`;
}

/** Lists a clone's worktrees and plans its move, or returns every refusal, in the order in which they were found. */
export function planCloneMove(run: VerbRun, from: string, to: string): MovePlan | string[] {
  const worktrees = run.adapters.listWorktrees(from);
  if (typeof worktrees === 'string') return [`cannot list the worktrees of ${from}: ${worktrees}`];
  const plan = planMove({ from, to }, worktrees, run.adapters);
  if (!Array.isArray(plan)) return plan;
  return plan.length === 0 ? ['the move is refused'] : plan;
}

/** Prints a planned or completed rename as `<from> -> <to>`, each path in its `~` form. */
export function printMove(run: VerbRun, move: Move, isDryRun: boolean): void {
  const line = `${formatDisplayPath(move.from, run.home)} -> ${formatDisplayPath(move.to, run.home)}`;
  run.stdout(isDryRun ? `would move ${line}` : line);
}

/**
 * Prints each reference to the old paths that `collectReferences` finds, one per line, and reports on stderr each clone
 * or path that could not be searched.
 */
export function printReferences(
  run: VerbRun,
  oldPaths: readonly string[],
  entries: readonly RegistryEntry[],
  searchPaths: readonly string[],
): void {
  const report = collectReferences(run, oldPaths, entries, searchPaths);
  for (const problem of report.problems) run.stderr(`${PROG}: ${problem}`);
  for (const reference of report.references) run.stdout(formatReference(reference));
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
  relocatedWorktrees: readonly Move[],
  moves: readonly Move[],
  isDryRun: boolean,
): void {
  const events = settleMove(relocatedWorktrees, moves, {
    adapters: run.adapters,
    home: run.home,
    isDryRun,
    sessionsDir: run.sessionsDir,
  });
  for (const event of events) {
    const line = formatSettleEvent(event, run.home);
    if (line.stream === 'stdout') run.stdout(line.text);
    else run.stderr(`${PROG}: ${line.text}`);
  }
}

/** Reports on stderr each worktree that git lists but that is missing from disk, and that the move skips. */
export function reportSkippedWorktrees(run: VerbRun, skippedWorktrees: readonly string[]): void {
  for (const worktree of skippedWorktrees) {
    run.stderr(`${PROG}: ${formatDisplayPath(worktree, run.home)} is missing; run git worktree prune to drop it`);
  }
}
