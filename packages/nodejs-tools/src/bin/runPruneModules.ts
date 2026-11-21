import fs from 'node:fs';
import path from 'node:path';

import { isAffirmative, UsageError, type Writer } from '@williamthorsen/toolbelt.cli/candidate';
import { describeError } from '@williamthorsen/toolbelt.errors';
import { safeParseInteger } from '@williamthorsen/toolbelt.numbers';

import { findLastActivity } from './findLastActivity.ts';
import { findProtectingPattern } from './findProtectingPattern.ts';
import { listNodeModulesDirs } from './listNodeModulesDirs.ts';
import { measureDiskUsage } from './measureDiskUsage.ts';
import { describeDirectoriesTotal, renderPruneListing, renderPruneSummary } from './prune-modules-text.ts';
import { readProtectList } from './readProtectList.ts';
import { EXIT_FAILED, EXIT_NOT_APPLICABLE, EXIT_OK, serializeResult } from './thor-node-result.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_ACTIVE_DAYS = 30;

/** The protect-list path under the home directory when `--protect-list` is absent. */
export const DEFAULT_PROTECT_LIST = '.config/thor-node/protected-node-modules.txt';

/** The scan root under the home directory when `--root` is absent. */
export const DEFAULT_ROOT = 'repos';

/**
 * Parses `--active-days`, which takes a positive whole number of days.
 *
 * @internal
 */
export function parseActiveDays(raw: string): number {
  const days = safeParseInteger(raw);
  if (days === undefined || days < 1) throw new Error('must be a positive whole number of days');

  return days;
}

/**
 * A `node_modules` directory that the scan found, with whether it is kept and why. A kept directory is not measured,
 * so its `bytes` is null.
 */
export type PruneDirectory =
  | {
      readonly bytes: number;
      readonly lastActivityAt: null;
      readonly message: null;
      readonly path: string;
      readonly pattern: null;
      readonly status: 'candidate' | 'deleted';
    }
  | {
      readonly bytes: number;
      readonly lastActivityAt: null;
      /** Why the deletion failed. */
      readonly message: string;
      readonly path: string;
      readonly pattern: null;
      readonly status: 'failed';
    }
  | {
      readonly bytes: null;
      /** When the project was last active, as ISO 8601. */
      readonly lastActivityAt: string;
      readonly message: null;
      readonly path: string;
      readonly pattern: null;
      readonly status: 'active';
    }
  | {
      readonly bytes: null;
      readonly lastActivityAt: null;
      readonly message: null;
      readonly path: string;
      /** The protect-list pattern that keeps the directory. */
      readonly pattern: string;
      readonly status: 'protected';
    }
  | {
      readonly bytes: null;
      readonly lastActivityAt: null;
      readonly message: null;
      readonly path: string;
      readonly pattern: null;
      readonly status: 'unreadable';
    };

/** The effects that pruning needs beyond the filesystem. */
export interface PruneModulesEffects {
  readonly homeDir: string;
  /** Reports whether stdin is a terminal, which confirmation needs. */
  readonly isStdinTty: () => boolean;
  /** Returns the current time in milliseconds since the epoch. */
  readonly now: () => number;
  /** Asks a question on stderr and resolves to the line typed in answer, or undefined at the end of input. */
  readonly readAnswer: (question: string) => Promise<string | undefined>;
}

/** The parsed `prune-modules` flags. */
export interface PruneModulesOptions {
  readonly activeDays: number | undefined;
  readonly apply: boolean;
  readonly json: boolean;
  readonly noActiveGuard: boolean;
  readonly noConfirm: boolean;
  readonly protectList: string | undefined;
  readonly root: string | undefined;
}

/** What `prune-modules` found and did, or why it does not apply. */
export type PruneModulesResult =
  | ScannedPrune
  | {
      readonly activeDays: number | null;
      readonly directories: readonly [];
      readonly outcome: 'not-applicable';
      readonly protectList: null;
      readonly reason: string;
      readonly root: string;
      readonly warnings: readonly [];
    };

/** An entry that the scan could not read. */
export interface PruneWarning {
  readonly message: string;
  readonly path: string;
}

/**
 * Runs `prune-modules`: reports every `node_modules` directory under the root that is neither protected nor recently
 * active, and under `apply` deletes them after confirmation, writing the text or under `json` the JSON document.
 * Resolves to the exit code; a usage problem is thrown as a `UsageError`.
 *
 * @internal
 */
export async function runPruneModules(
  options: PruneModulesOptions,
  effects: PruneModulesEffects,
  streams: { readonly stderr: Writer; readonly stdout: Writer },
): Promise<number> {
  const { stderr, stdout } = streams;

  if (options.noActiveGuard && options.activeDays !== undefined) {
    throw new UsageError('--active-days cannot be combined with --no-active-guard.');
  }
  if (options.json && options.apply && !options.noConfirm) {
    throw new UsageError(
      '--json --apply cannot ask for confirmation; pass --no-confirm to delete without asking, or drop --json to review the list before confirming.',
    );
  }
  if (options.apply && !options.noConfirm && !effects.isStdinTty()) {
    throw new UsageError('Confirming --apply needs a terminal on stdin; pass --no-confirm to delete without asking.');
  }

  const now = effects.now();
  const plan = planPruneModules(options, effects, now);
  for (const warning of plan.warnings) stderr.write(`warning: cannot read ${warning.path}: ${warning.message}\n`);

  // The listing precedes the confirmation, which needs it in view.
  if (plan.outcome !== 'not-applicable' && !options.json) stdout.write(renderPruneListing(plan, now));
  const result = plan.outcome === 'not-applicable' ? plan : await settlePrunePlan(plan, options, effects);

  const summary = renderPruneSummary(result);
  const stdoutText = options.json ? serializeResult(result) : summary.stdout;
  if (stdoutText !== '') stdout.write(stdoutText);
  if (summary.stderr !== '') stderr.write(summary.stderr);

  return resolvePruneModulesExitCode(result);
}

/** What `prune-modules` found under a root that exists, and what it did with it. */
export interface ScannedPrune {
  /** The active window in days, or null under `--no-active-guard`. */
  readonly activeDays: number | null;
  readonly directories: readonly PruneDirectory[];
  readonly outcome: 'applied' | 'declined' | 'planned';
  readonly protectList: { readonly found: boolean; readonly path: string };
  readonly reason: null;
  readonly root: string;
  readonly warnings: readonly PruneWarning[];
}

// region | Helpers

/** Deletes the planned candidates, recording each one as deleted or failed with the reason that it failed. */
function applyPrunePlan(plan: ScannedPrune): ScannedPrune {
  const directories = plan.directories.map((directory): PruneDirectory => {
    if (directory.status !== 'candidate') return directory;

    try {
      fs.rmSync(directory.path, { recursive: true });
      return { ...directory, status: 'deleted' };
    } catch (error) {
      return { ...directory, message: describeError(error), status: 'failed' };
    }
  });

  return { ...plan, directories, outcome: 'applied' };
}

/**
 * Decides whether a `node_modules` directory is kept and why, measuring it only when it is a candidate. A project that
 * cannot be read is reported and kept.
 */
function classify(dir: string, context: ClassifyContext): PruneDirectory {
  const kept = { bytes: null, lastActivityAt: null, message: null, path: dir, pattern: null };
  const projectDir = path.dirname(dir);

  try {
    const reason = findKeepReason(projectDir, context);
    if (reason !== undefined) return { ...kept, ...reason };
  } catch (error) {
    context.warnUnreadable(projectDir, error);
    return { ...kept, status: 'unreadable' };
  }

  return {
    ...kept,
    bytes: measureDiskUsage(dir, context.seenInodes, { onUnreadable: context.warnUnreadable }),
    status: 'candidate',
  };
}

interface ClassifyContext {
  /** The span within which activity keeps a directory, or undefined when the guard is off. */
  readonly activeWindowMs: number | undefined;
  readonly entries: Parameters<typeof findProtectingPattern>[1];
  readonly now: number;
  readonly seenInodes: Set<string>;
  readonly warnUnreadable: (entry: string, error: unknown) => void;
}

/** Finds why a project's `node_modules` is kept, protection or recent activity, or undefined when it is not kept. */
function findKeepReason(projectDir: string, context: ClassifyContext): KeepReason | undefined {
  // A pattern may name the project through a symlink, as the root was given, or by its real path.
  const protecting =
    findProtectingPattern(projectDir, context.entries) ??
    findProtectingPattern(fs.realpathSync(projectDir), context.entries);
  if (protecting !== undefined) return { pattern: protecting.pattern, status: 'protected' };

  if (context.activeWindowMs !== undefined) {
    const { time } = findLastActivity(projectDir);
    if (context.now - time < context.activeWindowMs) {
      return { lastActivityAt: new Date(time).toISOString(), status: 'active' };
    }
  }

  return undefined;
}

/** Why a project's `node_modules` is kept. */
type KeepReason =
  | { readonly lastActivityAt: string; readonly status: 'active' }
  | { readonly pattern: string; readonly status: 'protected' };

/**
 * Finds every `node_modules` directory under the root and decides whether each is kept, and why, or is a candidate for
 * deletion, measuring the candidates. A project that cannot be read is kept, with a warning.
 */
function planPruneModules(options: PruneModulesOptions, effects: PruneModulesEffects, now: number): PruneModulesResult {
  const root = options.root ?? path.join(effects.homeDir, DEFAULT_ROOT);
  const activeDays = options.noActiveGuard ? null : (options.activeDays ?? DEFAULT_ACTIVE_DAYS);
  if (fs.statSync(root, { throwIfNoEntry: false })?.isDirectory() !== true) {
    return {
      activeDays,
      directories: [],
      outcome: 'not-applicable',
      protectList: null,
      reason: `Root ${root} is not an existing directory; nothing to prune.`,
      root,
      warnings: [],
    };
  }

  const protectListPath = options.protectList ?? path.join(effects.homeDir, DEFAULT_PROTECT_LIST);
  const protectList = readProtectList({
    explicit: options.protectList !== undefined,
    filePath: protectListPath,
    homeDir: effects.homeDir,
  });

  const warnings: PruneWarning[] = [];
  function warnUnreadable(entry: string, error: unknown): void {
    warnings.push({ message: describeError(error), path: entry });
  }
  const dirs = listNodeModulesDirs(root, { onUnreadable: warnUnreadable });
  const context: ClassifyContext = {
    activeWindowMs: activeDays === null ? undefined : activeDays * DAY_MS,
    entries: protectList.entries,
    now,
    seenInodes: new Set<string>(),
    warnUnreadable,
  };
  const directories = dirs.map((dir) => classify(dir, context));

  return {
    activeDays,
    directories,
    outcome: 'planned',
    protectList: { found: protectList.found, path: protectListPath },
    reason: null,
    root,
    warnings,
  };
}

/** Returns the exit code for a `prune-modules` result. */
function resolvePruneModulesExitCode(result: PruneModulesResult): number {
  switch (result.outcome) {
    case 'applied':
      return result.directories.some((directory) => directory.status === 'failed') ? EXIT_FAILED : EXIT_OK;
    case 'declined':
      return EXIT_FAILED;
    case 'not-applicable':
      return EXIT_NOT_APPLICABLE;
    case 'planned':
      return EXIT_OK;
  }
}

/** Settles a plan: leaves it as planned without `apply`, records a declined confirmation, or deletes. */
async function settlePrunePlan(
  plan: ScannedPrune,
  options: PruneModulesOptions,
  effects: PruneModulesEffects,
): Promise<ScannedPrune> {
  if (!options.apply) return plan;

  const candidates = plan.directories.filter((directory) => directory.status === 'candidate');
  if (candidates.length > 0 && !options.noConfirm) {
    const answer = await effects.readAnswer(`Delete ${describeDirectoriesTotal(candidates)}? [y/N] `);
    if (!isAffirmative(answer)) return { ...plan, outcome: 'declined' };
  }

  return applyPrunePlan(plan);
}

// endregion | Helpers
