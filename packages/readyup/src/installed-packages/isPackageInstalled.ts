import { resolvePackageRoot } from './resolvePackageRoot.ts';

/**
 * Reports whether a package is installed in the current project.
 *
 * Resolution is anchored to the current directory rather than to this module, so the answer describes
 * the project being worked on and not readyup's own installation. It also asks the filesystem rather
 * than the module resolver, which keeps ESM-only packages -- whose entry points no `require` condition
 * reaches -- from reading as absent.
 */
export function isPackageInstalled(packageName: string): boolean {
  return resolvePackageRoot(packageName) !== undefined;
}
