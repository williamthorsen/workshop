import fs from 'node:fs';
import path from 'node:path';

import { UsageError, type Writer } from '@williamthorsen/toolbelt.cli/candidate';
import { describeError } from '@williamthorsen/toolbelt.errors';
import { safeParseInteger } from '@williamthorsen/toolbelt.numbers/candidate';

import { findLastActivity } from './findLastActivity.ts';
import { findProtectingPattern } from './findProtectingPattern.ts';
import { listNodeModulesDirs } from './listNodeModulesDirs.ts';
import { measureDiskUsage } from './measureDiskUsage.ts';
import { readProtectList } from './readProtectList.ts';

const DAY_MS = 24 * 60 * 60 * 1_000;
const DECIMAL_UNITS = ['kB', 'MB', 'GB', 'TB'];
const DEFAULT_ACTIVE_DAYS = 30;
const EXIT_FAILED = 1;
const EXIT_NOT_APPLICABLE = 3;
const EXIT_OK = 0;
const KILO = 1_000;
const SKIPPED = 'skipped';

/** The protect-list path under the home directory when `--protect-list` is absent. */
export const DEFAULT_PROTECT_LIST = '.config/thor-node/protected-node-modules.txt';

/** The scan root under the home directory when `--root` is absent. */
export const DEFAULT_ROOT = 'repos';

/**
 * Reports every `node_modules` directory under the root that is neither protected nor recently active, and under
 * `apply` deletes them after confirmation. Resolves to the exit code; a usage problem is thrown as a `UsageError`.
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
  if (options.apply && !options.noConfirm && !effects.isStdinTty()) {
    throw new UsageError('Confirming --apply needs a terminal on stdin; pass --no-confirm to delete without asking.');
  }

  const root = options.root ?? path.join(effects.homeDir, DEFAULT_ROOT);
  if (fs.statSync(root, { throwIfNoEntry: false })?.isDirectory() !== true) {
    stderr.write(`Root ${root} is not an existing directory; nothing to prune.\n`);
    return EXIT_NOT_APPLICABLE;
  }

  const protectListPath = options.protectList ?? path.join(effects.homeDir, DEFAULT_PROTECT_LIST);
  const protectList = readProtectList({
    explicit: options.protectList !== undefined,
    filePath: protectListPath,
    homeDir: effects.homeDir,
  });

  function warnUnreadable(entry: string, error: unknown): void {
    stderr.write(`warning: cannot read ${entry}: ${describeError(error)}\n`);
  }
  const dirs = listNodeModulesDirs(root, { onUnreadable: warnUnreadable });
  const activeWindowMs = options.noActiveGuard ? undefined : (options.activeDays ?? DEFAULT_ACTIVE_DAYS) * DAY_MS;
  const now = effects.now();
  const seenInodes = new Set<string>();
  const findings = dirs.map((dir) =>
    classify(dir, { activeWindowMs, entries: protectList.entries, now, seenInodes, warnUnreadable }),
  );
  const candidates = findings.filter((finding) => finding.reason === undefined);
  const skippedCount = findings.length - candidates.length;
  const candidateBytes = sumBytes(candidates);

  const header = `protect-list: ${protectListPath}${protectList.found ? '' : ' (not found; nothing protected)'}`;
  stdout.write(`${[header, ...renderFindings(findings)].join('\n')}\n\n`);

  if (!options.apply) {
    stdout.write(`${describeTotal(candidates.length, candidateBytes)} would be deleted; ${skippedCount} ${SKIPPED}\n`);
    return EXIT_OK;
  }

  if (candidates.length > 0 && !options.noConfirm) {
    const answer = await effects.readAnswer(`Delete ${describeTotal(candidates.length, candidateBytes)}? [y/N] `);
    if (!isAffirmative(answer)) {
      stderr.write('Nothing deleted.\n');
      return EXIT_FAILED;
    }
  }

  const deleted = candidates.filter((finding) => deleteDir(finding.dir, stderr));
  stdout.write(`${describeTotal(deleted.length, sumBytes(deleted))} deleted; ${skippedCount} ${SKIPPED}\n`);

  return deleted.length === candidates.length ? EXIT_OK : EXIT_FAILED;
}

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
  readonly noActiveGuard: boolean;
  readonly noConfirm: boolean;
  readonly protectList: string | undefined;
  readonly root: string | undefined;
}

// region | Helpers

interface ClassifyContext {
  /** The span within which activity keeps a directory, or undefined when the guard is off. */
  readonly activeWindowMs: number | undefined;
  readonly entries: Parameters<typeof findProtectingPattern>[1];
  readonly now: number;
  readonly seenInodes: Set<string>;
  readonly warnUnreadable: (entry: string, error: unknown) => void;
}

interface Finding {
  readonly bytes: number;
  readonly dir: string;
  /** Why the directory is kept, or undefined for a deletion candidate. */
  readonly reason: string | undefined;
}

/** Decides whether a `node_modules` directory is kept and why, measuring it only when it is a candidate. */
function classify(dir: string, context: ClassifyContext): Finding {
  const projectDir = path.dirname(dir);

  // A pattern may name the project through a symlink, as the root was given, or by its real path.
  const protecting =
    findProtectingPattern(projectDir, context.entries) ??
    findProtectingPattern(fs.realpathSync(projectDir), context.entries);
  if (protecting !== undefined) return { bytes: 0, dir, reason: `protected by ${protecting.pattern}` };

  if (context.activeWindowMs !== undefined) {
    const ageMs = context.now - findLastActivity(projectDir).time;
    if (ageMs < context.activeWindowMs) return { bytes: 0, dir, reason: `active ${describeAge(ageMs)}` };
  }

  return {
    bytes: measureDiskUsage(dir, context.seenInodes, { onUnreadable: context.warnUnreadable }),
    dir,
    reason: undefined,
  };
}

/** Deletes a directory tree, reporting a failure on stderr; returns whether it succeeded. */
function deleteDir(dir: string, stderr: Writer): boolean {
  try {
    fs.rmSync(dir, { recursive: true });
    return true;
  } catch (error) {
    stderr.write(`failed to delete ${dir}: ${describeError(error)}\n`);
    return false;
  }
}

/** Renders an age in whole days, rounded down. */
function describeAge(ageMs: number): string {
  const days = Math.floor(ageMs / DAY_MS);
  if (days < 1) return 'today';

  return days === 1 ? '1 day ago' : `${days} days ago`;
}

/** Renders a directory count and its total size. */
function describeTotal(count: number, bytes: number): string {
  return `${count} ${count === 1 ? 'directory' : 'directories'} totaling ${formatBytes(bytes)}`;
}

/** Renders a byte count in decimal units with one decimal place. */
function formatBytes(bytes: number): string {
  if (bytes < KILO) return `${bytes} B`;

  let value = bytes / KILO;
  let unitIndex = 0;
  while (value >= KILO && unitIndex < DECIMAL_UNITS.length - 1) {
    value /= KILO;
    unitIndex += 1;
  }

  return `${value.toFixed(1)} ${DECIMAL_UNITS[unitIndex]}`;
}

/** Reports whether an answer confirms: `y` or `yes`, in any case. */
function isAffirmative(answer: string | undefined): boolean {
  return answer !== undefined && /^y(?:es)?$/i.test(answer.trim());
}

/** Renders one line per finding: a candidate's size, or `skipped`, right-aligned, then the path and any reason. */
function renderFindings(findings: readonly Finding[]): string[] {
  const labels = findings.map((finding) => (finding.reason === undefined ? formatBytes(finding.bytes) : SKIPPED));
  const width = Math.max(0, ...labels.map((label) => label.length));

  return findings.map((finding, index) => {
    const reason = finding.reason === undefined ? '' : ` (${finding.reason})`;

    return `${(labels[index] ?? '').padStart(width)}  ${finding.dir}${reason}`;
  });
}

/** Sums the measured sizes of findings. */
function sumBytes(findings: readonly Finding[]): number {
  return findings.reduce((total, finding) => total + finding.bytes, 0);
}

// endregion | Helpers
