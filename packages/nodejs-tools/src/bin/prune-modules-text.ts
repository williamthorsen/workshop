import type { PruneDirectory, PruneModulesResult, ScannedPrune } from './runPruneModules.ts';
import type { RenderedText } from './thor-node-result.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const DECIMAL_UNITS = ['kB', 'MB', 'GB', 'TB'];
const KILO = 1000;
const SKIPPED = 'skipped';

/** Renders the count of directories and their total measured size. */
export function describeDirectoriesTotal(directories: readonly PruneDirectory[]): string {
  const count = directories.length;
  const bytes = directories.reduce((total, directory) => total + (directory.bytes ?? 0), 0);

  return `${count} ${count === 1 ? 'directory' : 'directories'} totaling ${formatBytes(bytes)}`;
}

/**
 * Renders the protect-list in use and one line per directory: a candidate's size, or `skipped`, right-aligned, then
 * the path and any reason that keeps it. A blank line separates the listing from the summary.
 */
export function renderPruneListing(plan: ScannedPrune, now: number): string {
  const { directories, protectList } = plan;
  const header = `protect-list: ${protectList.path}${protectList.found ? '' : ' (not found; nothing protected)'}`;
  const labels = directories.map((directory) => (directory.bytes === null ? SKIPPED : formatBytes(directory.bytes)));
  const width = Math.max(0, ...labels.map((label) => label.length));
  const lines = directories.map(
    (directory, index) =>
      `${(labels[index] ?? '').padStart(width)}  ${directory.path}${describeKeepReason(directory, now)}`,
  );

  return `${[header, ...lines].join('\n')}\n\n`;
}

/**
 * Renders the text of a `prune-modules` result that follows the listing: the total on stdout, and on stderr each
 * failed deletion, the declined confirmation, or the reason that the command does not apply.
 */
export function renderPruneSummary(result: PruneModulesResult): RenderedText {
  const skippedCount = result.directories.filter((directory) => directory.bytes === null).length;

  switch (result.outcome) {
    case 'applied': {
      const deleted = result.directories.filter((directory) => directory.status === 'deleted');
      const failures = result.directories
        .filter((directory) => directory.status === 'failed')
        .map((directory) => `failed to delete ${directory.path}: ${directory.message}\n`);

      return {
        stderr: failures.join(''),
        stdout: `${describeDirectoriesTotal(deleted)} deleted; ${skippedCount} ${SKIPPED}\n`,
      };
    }
    case 'declined':
      return { stderr: 'Nothing deleted.\n', stdout: '' };
    case 'not-applicable':
      return { stderr: `${result.reason}\n`, stdout: '' };
    case 'planned': {
      const candidates = result.directories.filter((directory) => directory.status === 'candidate');

      return {
        stderr: '',
        stdout: `${describeDirectoriesTotal(candidates)} would be deleted; ${skippedCount} ${SKIPPED}\n`,
      };
    }
  }
}

// region | Helpers

/** Renders an age in whole days, rounded down. */
function describeAge(ageMs: number): string {
  const days = Math.floor(ageMs / DAY_MS);
  if (days < 1) return 'today';

  return days === 1 ? '1 day ago' : `${days} days ago`;
}

/** Renders why a directory is kept, or nothing for one that is not. */
function describeKeepReason(directory: PruneDirectory, now: number): string {
  switch (directory.status) {
    case 'active':
      return ` (active ${describeAge(now - Date.parse(directory.lastActivityAt))})`;
    case 'protected':
      return ` (protected by ${directory.pattern})`;
    case 'unreadable':
      return ' (unreadable)';
    case 'candidate':
    case 'deleted':
    case 'failed':
      return '';
  }
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

// endregion | Helpers
