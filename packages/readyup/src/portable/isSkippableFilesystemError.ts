/** Filesystem errors that cost a read one directory rather than the whole answer. */
const SKIPPABLE_ERROR_CODES = new Set(['EACCES', 'ENOENT', 'EPERM']);

/** Reports whether a filesystem failure is one a read may answer as an empty directory. */
export function isSkippableFilesystemError(error: unknown): boolean {
  return isNodeError(error) && error.code !== undefined && SKIPPABLE_ERROR_CODES.has(error.code);
}

// region | Helpers

/** Type guard for Node.js filesystem errors carrying a `code`. */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

// endregion | Helpers
