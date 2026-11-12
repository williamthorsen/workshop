import fs from 'node:fs';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { executeMove } from '../move/move-clone.ts';
import type { MovePlan } from '../move/move-plan.ts';
import { expandTilde, formatDisplayPath, normalizePath } from '../portable/paths.ts';
import { assertWritable, readRegistry, recordMove, type RegistryEntry, saveRegistry } from '../registry/registry.ts';
import { planCloneMove, printMove, printReferences, printSettlement, reportSkippedWorktrees } from './move-report.ts';
import { PROG, reportFailure, type VerbRun } from './verb-run.ts';

/** How a `move` or `apply-moves` run behaves. */
export interface MoveOptions {
  isDryRun: boolean;
  searchPaths: readonly string[];
}

/**
 * Runs `move`: moves the clone of the entry named `name` to `target` with its worktrees, rewrites the entry, and
 * reports the remaining references to the old paths. Under `--dry-run`, reports the moves and the references and
 * changes nothing.
 */
export function runMove(run: VerbRun, name: string, target: string, options: MoveOptions): number {
  const registry = readRegistry(run.file);
  if (typeof registry === 'string') return reportFailure(run, registry);
  const entry = findEntry(run, registry.entries, name);
  if (typeof entry === 'string') return reportFailure(run, entry);
  const oldPath = entry.path ?? '';

  const from = run.adapters.resolvePath(normalizePath(oldPath, run.home));
  const cloneRoot = run.adapters.readCloneRoot(from);
  if (cloneRoot === undefined) {
    return reportFailure(run, `the clone of ${name} is not on this machine at ${oldPath}`);
  }
  if (cloneRoot !== from) {
    return reportFailure(run, `${oldPath} is not the root of a clone; the main worktree is at ${cloneRoot}`);
  }
  const to = path.resolve(run.cwd, expandTilde(target, run.home));
  const claimant = registry.entries.find(
    (other) => other !== entry && other.path !== undefined && normalizePath(other.path, run.home) === to,
  );
  if (claimant !== undefined) {
    return reportFailure(run, `${formatDisplayPath(to, run.home)} is the path of ${claimant.name ?? 'another entry'}`);
  }
  const plan = planCloneMove(run, from, to);
  if (typeof plan === 'string') return reportFailure(run, `${plan}; nothing moved`);

  const refusal = assertWritable(run.file, run.adapters.readCurrentBranch);
  if (refusal !== undefined) return reportFailure(run, refusal);
  const registryFile = relocateFile(fs.realpathSync(run.file), plan);

  reportSkippedWorktrees(run, plan.skipped);
  const oldPaths = plan.moves.map((move) => move.from);
  if (options.isDryRun) {
    for (const move of plan.moves) printMove(run, move, true);
    printSettlement(run, plan.relocated, plan.moves, true);
    printReferences(run, oldPaths, registry.entries, options.searchPaths);
    run.stderr(`${PROG}: nothing moved; run without --dry-run to move ${name}`);
    return 0;
  }

  const outcome = executeMove(plan, run.adapters);
  for (const move of outcome.completed) printMove(run, move, false);
  if (outcome.failure !== undefined) {
    for (const move of outcome.remaining) {
      run.stderr(`${PROG}: not moved: ${formatDisplayPath(move.from, run.home)}`);
    }
    run.stderr(`${PROG}: ${outcome.failure}`);
  }
  printSettlement(run, outcome.relocated, outcome.completed, false);
  const newPath = formatDisplayPath(to, run.home);
  if (outcome.completed.length > 0) {
    recordMove(registry, entry, newPath);
    try {
      saveRegistry(registry, registryFile);
    } catch (error) {
      run.stderr(`${PROG}: cannot write ${registryFile}: ${describeError(error)}`);
      return reportFailure(run, `set the path of ${name} to ${newPath} and add ${oldPath} to its formerPaths by hand`);
    }
  }
  if (outcome.failure !== undefined) return 1;

  printReferences(run, oldPaths, registry.entries, options.searchPaths);
  run.stderr(`${PROG}: moved ${name} to ${newPath} and updated ${run.file}`);
  return 0;
}

// region | Helpers

/** Returns the one entry named `name`, when it has a path, or a message naming why there is not exactly one. */
function findEntry(run: VerbRun, entries: readonly RegistryEntry[], name: string): RegistryEntry | string {
  const matched = entries.filter((entry) => entry.name === name);
  if (matched.length > 1) return `${matched.length} entries in ${run.file} are named ${name}; give each a unique name`;
  const [entry] = matched;
  if (entry === undefined) return `no entry in ${run.file} is named ${name}`;
  return entry.path === undefined ? `the entry ${name} has no path` : entry;
}

/** Returns where a file will be once the plan's renames run: the same path unless it lies inside a moved directory. */
function relocateFile(file: string, plan: MovePlan): string {
  const move = plan.moves.find((candidate) => file.startsWith(`${candidate.from}/`));
  return move === undefined ? file : `${move.to}${file.slice(move.from.length)}`;
}

// endregion | Helpers
