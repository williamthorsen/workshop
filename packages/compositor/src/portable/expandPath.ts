import { homedir } from 'node:os';
import path from 'node:path';

/**
 * Expands an authored location to an absolute path, resolving a relative one against `baseDir`.
 *
 * Resolving against `baseDir` rather than the working directory is what makes an authored path mean the same thing
 * wherever the process runs. Computes a path and reads nothing, so whether the result exists is the caller's question.
 *
 * Only the current user's home is expanded. A `~user` form names someone else's, which resolving would require reading
 * the account database, so it falls through and resolves as the relative path it looks like.
 */
export function expandPath(location: string, baseDir: string): string {
  if (location === '~' || location.startsWith('~/')) {
    return path.join(homedir(), location.slice(1));
  }
  if (path.isAbsolute(location)) {
    return location;
  }
  return path.resolve(baseDir, location);
}
