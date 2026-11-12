import path from 'node:path';

import { encodeSessionDirectoryName } from '../claude/claude-sessions.ts';
import type { CloneAdapters } from '../commands/verb-run.ts';
import { formatDisplayPath } from '../portable/paths.ts';
import type { Move } from './move-plan.ts';

/** One line that `settleMove` reports: an action on stdout, or a problem on stderr. */
export interface ReportLine {
  stream: 'stderr' | 'stdout';
  text: string;
}

/** The operations with which `settleMove` probes and changes the filesystem. */
export type SettleAdapters = Pick<
  CloneAdapters,
  'allowDirenv' | 'isDirenvInstalled' | 'listDirectory' | 'pathExists' | 'removeDirectory' | 'removeFile' | 'renamePath'
>;

/** The state in which `settleMove` runs. */
export interface SettleContext {
  adapters: SettleAdapters;
  home: string;
  isDryRun: boolean;
  sessionsDir: string;
}

/**
 * Settles what a move leaves behind, given the worktrees that moved and the top-level renames: allows direnv in each
 * worktree that has an `.envrc`, renames each worktree's Claude Code session directory to match its new path, and
 * removes each former parent that the renames leave empty but for a `.DS_Store`. Under a dry run, reports the actions
 * against the state before the move and performs none. A failure is reported and does not stop the other actions.
 */
export function settleMove(relocated: readonly Move[], moves: readonly Move[], context: SettleContext): ReportLine[] {
  return [
    ...allowMovedEnvrcs(relocated, context),
    ...renameSessionDirectories(relocated, context),
    ...removeEmptiedParents(moves, context),
  ];
}

// region | Helpers

/** Allows direnv in each moved worktree that has an `.envrc` at its root, silently when direnv is not installed. */
function allowMovedEnvrcs(relocated: readonly Move[], context: SettleContext): ReportLine[] {
  const { adapters, home, isDryRun } = context;
  const trees = relocated.filter((tree) => adapters.pathExists(path.join(isDryRun ? tree.from : tree.to, '.envrc')));
  if (trees.length === 0) return [];
  if (isDryRun) {
    if (!adapters.isDirenvInstalled()) return [];
    return trees.map((tree) => report('stdout', `would run direnv allow ${formatDisplayPath(tree.to, home)}`));
  }

  const lines: ReportLine[] = [];
  for (const tree of trees) {
    const shown = formatDisplayPath(tree.to, home);
    const failure = adapters.allowDirenv(tree.to);
    if (failure === 'absent') break;
    lines.push(
      failure === undefined
        ? report('stdout', `direnv allow ${shown}`)
        : report('stderr', `cannot run direnv allow ${shown}: ${failure}`),
    );
  }
  return lines;
}

/** Builds a report line. */
function report(stream: ReportLine['stream'], text: string): ReportLine {
  return { stream, text };
}

/**
 * Removes each former parent of a rename that the renames leave empty, deleting a `.DS_Store` first. A parent that
 * contains the destination of any rename is kept.
 */
function removeEmptiedParents(moves: readonly Move[], context: SettleContext): ReportLine[] {
  const { adapters, home, isDryRun } = context;
  const parents = [...new Set(moves.map((move) => path.dirname(move.from)))].filter((parent) =>
    moves.every((move) => !move.to.startsWith(`${parent}/`)),
  );
  const lines: ReportLine[] = [];
  for (const parent of parents) {
    const shown = formatDisplayPath(parent, home);
    const entries = adapters.listDirectory(parent);
    if (typeof entries === 'string') {
      lines.push(report('stderr', `cannot read ${shown}: ${entries}`));
      continue;
    }
    // Until the renames run, the trees that leave the parent are still among its entries.
    const leaving = isDryRun
      ? moves.filter((move) => path.dirname(move.from) === parent).map((move) => path.basename(move.from))
      : [];
    if (entries.some((entry) => entry !== '.DS_Store' && !leaving.includes(entry))) continue;
    if (isDryRun) {
      lines.push(report('stdout', `would remove ${shown}`));
      continue;
    }
    const failure =
      (entries.includes('.DS_Store') ? adapters.removeFile(path.join(parent, '.DS_Store')) : undefined) ??
      adapters.removeDirectory(parent);
    lines.push(
      failure === undefined
        ? report('stdout', `removed ${shown}`)
        : report('stderr', `cannot remove ${shown}: ${failure}`),
    );
  }
  return lines;
}

/** Renames each moved worktree's session directory to the name of its new path, leaving it when that name is taken. */
function renameSessionDirectories(relocated: readonly Move[], context: SettleContext): ReportLine[] {
  const { adapters, home, isDryRun, sessionsDir } = context;
  const lines: ReportLine[] = [];
  for (const tree of relocated) {
    const from = path.join(sessionsDir, encodeSessionDirectoryName(tree.from));
    if (!adapters.pathExists(from)) continue;
    const to = path.join(sessionsDir, encodeSessionDirectoryName(tree.to));
    const text = `${formatDisplayPath(from, home)} -> ${formatDisplayPath(to, home)}`;
    if (adapters.pathExists(to)) {
      lines.push(report('stderr', `not moved, because the destination exists; merge them by hand: ${text}`));
      continue;
    }
    if (isDryRun) {
      lines.push(report('stdout', `would move ${text}`));
      continue;
    }
    const failure = adapters.renamePath(from, to);
    lines.push(failure === undefined ? report('stdout', text) : report('stderr', `cannot move ${text}: ${failure}`));
  }
  return lines;
}

// endregion | Helpers
