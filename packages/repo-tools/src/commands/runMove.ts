import fs from 'node:fs';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { executeMove } from '../move/move-clone.ts';
import type { Move, MovePlan } from '../move/move-plan.ts';
import { type SettleEvent, settleMove } from '../move/settle-move.ts';
import { expandTilde, formatDisplayPath, normalizePath } from '../portable/paths.ts';
import type { ReferenceReport } from '../references/find-references.ts';
import {
  assertWritable,
  findPathClaimant,
  readRegistry,
  recordMove,
  type RegistryEntry,
  saveRegistry,
} from '../registry/registry.ts';
import { collectReferences, type MoveOptions, planCloneMove } from './move-report.ts';
import { deriveMoveStatus, type MoveResult, type RegistryWrite } from './move-result.ts';
import { renderMoveLines } from './render-move.ts';
import { findUnexpandablePath, reportFailure, resolveRunOutputStyle, type VerbRun, writeReport } from './verb-run.ts';

/**
 * Moves the clone of the entry named `name` to `target` with its worktrees, settles what the move left behind, records
 * the new path in the registry, and searches for the remaining references to the old paths. Under `--dry-run`, plans
 * the same and changes nothing. Writes no stream. Returns the failure when the registry cannot be read, a path cannot
 * be expanded, or `name` does not name exactly one entry with a path.
 */
export function moveEntry(run: VerbRun, name: string, target: string, options: MoveOptions): MoveResult | string {
  const registry = readRegistry(run.file);
  if (typeof registry === 'string') return registry;
  const unexpandable = findUnexpandablePath(run, registry.entries, [target, ...options.searchPaths]);
  if (unexpandable !== undefined) return unexpandable;
  const entry = findEntry(run, registry.entries, name);
  if (typeof entry === 'string') return entry;
  const oldPath = entry.path ?? '';
  function block(reasons: string[]): MoveResult {
    return buildResult(name, options.isDryRun, { reasons, status: 'blocked' });
  }

  const from = run.adapters.resolvePath(normalizePath(oldPath, run.home));
  const cloneRoot = run.adapters.readCloneRoot(from);
  if (cloneRoot === undefined) return block([`the clone of ${name} is not on this machine at ${oldPath}`]);
  if (cloneRoot !== from) {
    return block([`${oldPath} is not the root of a clone; the main worktree is at ${cloneRoot}`]);
  }
  const to = path.resolve(run.cwd, expandTilde(target, run.home));
  const claimant = findPathClaimant(registry.entries, entry, to, run.home);
  if (claimant !== undefined) {
    return block([`${formatDisplayPath(to, run.home)} is the path of ${claimant.name ?? 'another entry'}`]);
  }
  const plan = planCloneMove(run, from, to);
  if (Array.isArray(plan)) return block(plan);
  const refusal = assertWritable(run.file, run.adapters.readCurrentBranch);
  if (refusal !== undefined) return block([refusal]);

  const write = {
    file: relocateFile(fs.realpathSync(run.file), plan),
    formerPath: oldPath,
    path: formatDisplayPath(to, run.home),
  };
  const oldPaths = plan.moves.map((move) => move.from);
  const { entries } = registry;
  function settle(relocatedWorktrees: readonly Move[], moves: readonly Move[]): SettleEvent[] {
    return settleMove(relocatedWorktrees, moves, {
      adapters: run.adapters,
      home: run.home,
      isDryRun: options.isDryRun,
      sessionsDir: run.sessionsDir,
    });
  }
  function search(): ReferenceReport {
    return collectReferences(run, oldPaths, entries, options.searchPaths);
  }

  if (options.isDryRun) {
    return buildResult(name, true, {
      ...search(),
      missingWorktrees: plan.skippedWorktrees,
      moves: plan.moves,
      registry: { ...write, status: 'planned' },
      settlement: settle(plan.relocatedWorktrees, plan.moves),
      status: 'planned',
    });
  }

  const outcome = executeMove(plan, run.adapters);
  const settlement = settle(outcome.relocatedWorktrees, outcome.completedMoves);
  let registryWrite: RegistryWrite = { status: 'skipped' };
  if (outcome.completedMoves.length > 0) {
    recordMove(registry, entry, write.path);
    try {
      saveRegistry(registry, write.file);
      registryWrite = { ...write, status: 'written' };
    } catch (error) {
      registryWrite = { ...write, reason: describeError(error), status: 'failed' };
    }
  }
  const executed = {
    missingWorktrees: plan.skippedWorktrees,
    moves: outcome.completedMoves,
    registry: registryWrite,
    settlement,
  };
  if (outcome.failure !== undefined) {
    return buildResult(name, false, {
      ...executed,
      notMoved: outcome.remainingMoves,
      reasons: [outcome.failure],
      status: 'failed',
    });
  }
  return buildResult(name, false, { ...executed, ...search(), status: 'moved' });
}

/**
 * Runs `move`: moves the clone, then prints the result as status lines, or as JSON under `--json`. Exits 1 when the
 * move was blocked or failed or the registry write failed, and 2 when the output style names a style that does not
 * exist.
 */
export function runMove(
  run: VerbRun,
  name: string,
  target: string,
  options: MoveOptions & { isJson: boolean },
): number {
  const style = resolveRunOutputStyle(run);
  if (style === undefined) return 2;
  const result = moveEntry(run, name, target, options);
  if (typeof result === 'string') return reportFailure(run, result);

  writeReport(run, renderMoveLines(result, style, run.home), result, options.isJson);
  return deriveMoveStatus(result);
}

// region | Helpers

/** Builds a result with every list empty and the registry write skipped, overridden by `fields`. */
function buildResult(
  entry: string,
  isDryRun: boolean,
  fields: Partial<MoveResult> & Pick<MoveResult, 'status'>,
): MoveResult {
  return {
    entry,
    isDryRun,
    missingWorktrees: [],
    moves: [],
    notMoved: [],
    problems: [],
    reasons: [],
    references: [],
    registry: { status: 'skipped' },
    settlement: [],
    ...fields,
  };
}

/** Returns the one entry named `name`, when it has a path, or a message naming why there is not exactly one. */
function findEntry(run: VerbRun, entries: readonly RegistryEntry[], name: string): RegistryEntry | string {
  const matchedEntries = entries.filter((entry) => entry.name === name);
  if (matchedEntries.length > 1)
    return `${matchedEntries.length} entries in ${run.file} are named ${name}; give each a unique name`;
  const [entry] = matchedEntries;
  if (entry === undefined) return `no entry in ${run.file} is named ${name}`;
  return entry.path === undefined ? `the entry ${name} has no path` : entry;
}

/** Returns where a file will be once the plan's renames run: the same path unless it lies inside a moved directory. */
function relocateFile(file: string, plan: MovePlan): string {
  const move = plan.moves.find((candidate) => file.startsWith(`${candidate.from}/`));
  return move === undefined ? file : `${move.to}${file.slice(move.from.length)}`;
}

// endregion | Helpers
