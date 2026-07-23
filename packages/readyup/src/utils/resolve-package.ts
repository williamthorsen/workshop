import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

/**
 * Report whether a package resolves from the current project.
 *
 * Resolution is anchored to a notional file in the current directory rather than to this module, so
 * the answer describes the project being worked on and not readyup's own installation.
 */
export function isPackageResolvable(packageName: string): boolean {
  try {
    createRequire(path.join(process.cwd(), 'noop.js')).resolve(packageName);
    return true;
  } catch {
    return false;
  }
}
