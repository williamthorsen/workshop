import process from 'node:process';

import type { RaisedWarning } from '../schemas/common.ts';
import type { DirectoryDependence } from './validateCompiledOutput.ts';

/**
 * Warns that a kit's recorded checks depend on the directory from which it is imported, and returns the warning, or
 * nothing when they do not.
 *
 * The stderr line is written in both output modes; the returned entries are what JSON mode adds to the payload.
 */
export function warnOnDirectoryDependentChecks(
  kitName: string,
  directoryDependence: DirectoryDependence | undefined,
): RaisedWarning[] {
  if (directoryDependence === undefined) return [];

  const finding =
    'error' in directoryDependence
      ? `fails to load from another directory (${directoryDependence.error})`
      : `records different checks from another directory in ${formatChecklists(directoryDependence.checklists)}`;
  const warning: RaisedWarning = {
    code: 'checks-vary-by-directory',
    message: `kit "${kitName}" ${finding}, so its manifest describes the directory that compiled it rather than the kit.`,
    remedy:
      'Build checks that depend on the repo under check in a function assigned to `checks`, which runs when the checklist runs, rather than when the kit loads.',
  };
  process.stderr.write(`Warning: ${warning.message} ${warning.remedy}\n`);
  return [warning];
}

// region | Helpers

/** Returns the checklist names quoted and joined, naming each as a checklist. */
function formatChecklists(names: string[]): string {
  const quoted = names.map((name) => `"${name}"`).join(', ');
  return names.length === 1 ? `checklist ${quoted}` : `checklists ${quoted}`;
}

// endregion | Helpers
