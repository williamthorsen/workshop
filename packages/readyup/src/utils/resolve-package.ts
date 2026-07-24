import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

/** Resolution failures that mean the package is absent rather than present but unreachable. */
const NOT_INSTALLED_CODES = new Set(['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND']);

/**
 * Report whether a package is installed in the current project.
 *
 * Resolution is anchored to a notional file in the current directory rather than to this module, so
 * the answer describes the project being worked on and not readyup's own installation.
 *
 * Only a not-found code answers false. `createRequire` resolves under the `require` condition, which
 * an ESM-only package does not publish; that failure reports the package as found and only its
 * export conditions as unmatched, which is an installed package either way.
 */
export function isPackageInstalled(packageName: string): boolean {
  try {
    createRequire(path.join(process.cwd(), 'noop.js')).resolve(packageName);
    return true;
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && typeof error.code === 'string') {
      return !NOT_INSTALLED_CODES.has(error.code);
    }
    return false;
  }
}
