import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';

/**
 * Returns the real path of the node binary that asdf selects for a checkout, so that a launchd agent can run it
 * directly: An asdf shim on PATH needs an initialized shell, which launchd does not provide.
 *
 * Falls back to the running node when asdf cannot be run, exits non-zero, or prints nothing. Throws when the path that
 * asdf names does not exist.
 */
export function resolveNodePath(checkoutDir: string): string {
  const asdf = spawnSync('asdf', ['which', 'node'], { cwd: checkoutDir, encoding: 'utf8' });
  const asdfPath = asdf.status === 0 ? asdf.stdout.trim() : '';

  return realpathSync(asdfPath === '' ? process.execPath : asdfPath);
}
