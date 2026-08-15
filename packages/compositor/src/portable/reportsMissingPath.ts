/**
 * Reports whether `error` means the path is simply not there.
 *
 * `ENOTDIR` joins `ENOENT` because a probe below a path segment that turned out to be a regular file fails with the
 * former and means the same thing. Every other failure, `EACCES` above all, is a problem to surface rather than an
 * absence to skip past.
 */
export function reportsMissingPath(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  return error.code === 'ENOENT' || error.code === 'ENOTDIR';
}
