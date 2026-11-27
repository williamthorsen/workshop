import { type MovePlan, planMove } from '../move/move-plan.ts';
import { expandTilde } from '../portable/paths.ts';
import { findReferences, type Reference, type ReferenceReport } from '../references/find-references.ts';
import type { RegistryEntry } from '../registry/registry.ts';
import { formatEntryName, type VerbRun } from './verb-run.ts';

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
