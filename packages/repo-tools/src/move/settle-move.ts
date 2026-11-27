import path from 'node:path';

import { encodeSessionDirectoryName } from '../claude/claude-sessions.ts';
import type { CloneAdapters } from '../commands/verb-run.ts';
import { formatDisplayPath } from '../portable/paths.ts';
import type { Move } from './move-plan.ts';

/** Formats a settlement event as the line that `move` prints, and the stream to which it goes. */
export function formatSettleEvent(event: SettleEvent, home: string): ReportLine {
  switch (event.action) {
    case 'allow-direnv': {
      const shown = formatDisplayPath(event.path, home);
      if (event.status === 'failed') return report('stderr', `cannot run direnv allow ${shown}: ${event.reason}`);
      return report('stdout', event.status === 'planned' ? `would run direnv allow ${shown}` : `direnv allow ${shown}`);
    }
    case 'locate-session-directories':
      return report('stderr', `session directories not renamed: ${event.reason}`);
    case 'move-session-directory': {
      const text = `${formatDisplayPath(event.from, home)} -> ${formatDisplayPath(event.to, home)}`;
      if (event.status === 'destination-exists') {
        return report('stderr', `not moved, because the destination exists; merge them by hand: ${text}`);
      }
      if (event.status === 'failed') return report('stderr', `cannot move ${text}: ${event.reason}`);
      return report('stdout', event.status === 'planned' ? `would move ${text}` : text);
    }
    case 'remove-directory': {
      const shown = formatDisplayPath(event.path, home);
      if (event.status === 'unreadable') return report('stderr', `cannot read ${shown}: ${event.reason}`);
      if (event.status === 'failed') return report('stderr', `cannot remove ${shown}: ${event.reason}`);
      return report('stdout', event.status === 'planned' ? `would remove ${shown}` : `removed ${shown}`);
    }
  }
}

/** One line that `formatSettleEvent` produces: an action on stdout, or a problem on stderr. */
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
  sessionsDir: string | undefined;
}

/** One action that `settleMove` took, planned, or failed to take, with absolute paths. */
export type SettleEvent =
  | { action: 'allow-direnv'; path: string; status: 'done' | 'planned' }
  | { action: 'allow-direnv'; path: string; reason: string; status: 'failed' }
  | { action: 'locate-session-directories'; reason: string; status: 'failed' }
  | { action: 'move-session-directory'; from: string; status: 'destination-exists' | 'done' | 'planned'; to: string }
  | { action: 'move-session-directory'; from: string; reason: string; status: 'failed'; to: string }
  | { action: 'remove-directory'; path: string; status: 'done' | 'planned' }
  | { action: 'remove-directory'; path: string; reason: string; status: 'failed' | 'unreadable' };

/**
 * Settles what a move leaves behind, given the worktrees that moved and the top-level renames: allows direnv in each
 * worktree that has an `.envrc`, renames each worktree's Claude Code session directory to match its new path, and
 * removes each former parent that the renames leave empty but for a `.DS_Store`. Under a dry run, reports the actions
 * against the state before the move and performs none. A failure is reported and does not stop the other actions.
 */
export function settleMove(
  relocatedWorktrees: readonly Move[],
  moves: readonly Move[],
  context: SettleContext,
): SettleEvent[] {
  return [
    ...allowMovedEnvrcs(relocatedWorktrees, context),
    ...renameSessionDirectories(relocatedWorktrees, context),
    ...removeEmptiedParents(moves, context),
  ];
}

// region | Helpers
/** Allows direnv in each moved worktree that has an `.envrc` at its root, silently when direnv is not installed. */
function allowMovedEnvrcs(relocatedWorktrees: readonly Move[], context: SettleContext): SettleEvent[] {
  const { adapters, isDryRun } = context;
  const trees = relocatedWorktrees.filter((tree) =>
    adapters.pathExists(path.join(isDryRun ? tree.from : tree.to, '.envrc')),
  );
  if (trees.length === 0) return [];
  if (isDryRun) {
    if (!adapters.isDirenvInstalled()) return [];
    return trees.map((tree) => ({ action: 'allow-direnv', path: tree.to, status: 'planned' }));
  }

  const events: SettleEvent[] = [];
  for (const tree of trees) {
    const failure = adapters.allowDirenv(tree.to);
    if (failure === 'absent') break;
    events.push(
      failure === undefined
        ? { action: 'allow-direnv', path: tree.to, status: 'done' }
        : { action: 'allow-direnv', path: tree.to, reason: failure, status: 'failed' },
    );
  }
  return events;
}

/**
 * Removes each former parent of a rename that the renames leave empty, deleting a `.DS_Store` first. A parent that
 * contains the destination of any rename is kept.
 */
function removeEmptiedParents(moves: readonly Move[], context: SettleContext): SettleEvent[] {
  const { adapters, isDryRun } = context;
  const parents = [...new Set(moves.map((move) => path.dirname(move.from)))].filter((parent) =>
    moves.every((move) => !move.to.startsWith(`${parent}/`)),
  );
  const events: SettleEvent[] = [];
  for (const parent of parents) {
    const entries = adapters.listDirectory(parent);
    if (typeof entries === 'string') {
      events.push({ action: 'remove-directory', path: parent, reason: entries, status: 'unreadable' });
      continue;
    }
    // Until the renames run, the trees that leave the parent are still among its entries.
    const leavingNames = isDryRun
      ? moves.filter((move) => path.dirname(move.from) === parent).map((move) => path.basename(move.from))
      : [];
    if (entries.some((entry) => entry !== '.DS_Store' && !leavingNames.includes(entry))) continue;
    if (isDryRun) {
      events.push({ action: 'remove-directory', path: parent, status: 'planned' });
      continue;
    }
    const failure =
      (entries.includes('.DS_Store') ? adapters.removeFile(path.join(parent, '.DS_Store')) : undefined) ??
      adapters.removeDirectory(parent);
    events.push(
      failure === undefined
        ? { action: 'remove-directory', path: parent, status: 'done' }
        : { action: 'remove-directory', path: parent, reason: failure, status: 'failed' },
    );
  }
  return events;
}

/**
 * Renames each moved worktree's session directory to the name of its new path, leaving it when that name is taken.
 * Reports instead that none is renamed when the sessions directory cannot be located.
 */
function renameSessionDirectories(relocatedWorktrees: readonly Move[], context: SettleContext): SettleEvent[] {
  const { adapters, isDryRun, sessionsDir } = context;
  if (sessionsDir === undefined) {
    return relocatedWorktrees.length === 0
      ? []
      : [
          {
            action: 'locate-session-directories',
            reason: 'CLAUDE_CONFIG_DIR is unset, and HOME is unset or empty',
            status: 'failed',
          },
        ];
  }
  const events: SettleEvent[] = [];
  for (const tree of relocatedWorktrees) {
    const from = path.join(sessionsDir, encodeSessionDirectoryName(tree.from));
    if (!adapters.pathExists(from)) continue;
    const to = path.join(sessionsDir, encodeSessionDirectoryName(tree.to));
    if (adapters.pathExists(to)) {
      events.push({ action: 'move-session-directory', from, status: 'destination-exists', to });
      continue;
    }
    if (isDryRun) {
      events.push({ action: 'move-session-directory', from, status: 'planned', to });
      continue;
    }
    const failure = adapters.renamePath(from, to);
    events.push(
      failure === undefined
        ? { action: 'move-session-directory', from, status: 'done', to }
        : { action: 'move-session-directory', from, reason: failure, status: 'failed', to },
    );
  }
  return events;
}

/** Builds a report line. */
function report(stream: ReportLine['stream'], text: string): ReportLine {
  return { stream, text };
}
// endregion | Helpers
