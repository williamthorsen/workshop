import { UsageError } from '@williamthorsen/toolbelt.cli/candidate';
import validatePackageName from 'validate-npm-package-name';

/**
 * Throws a `UsageError` listing npm's reasons when a name is not valid: for a new package under `new`, or for any
 * package that the registry may hold under `old`, whose rules admit names that predate the current ones.
 */
export function assertValidName(name: string, kind: 'new' | 'old'): void {
  const result = validatePackageName(name);
  if (kind === 'new' ? result.validForNewPackages : result.validForOldPackages) return;

  const reasons = [...(result.errors ?? []), ...(result.warnings ?? [])];
  throw new UsageError([`invalid package name '${name}':`, ...reasons.map((reason) => `  ${reason}`)].join('\n'));
}
