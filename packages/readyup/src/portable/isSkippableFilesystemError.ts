import { isError } from '@williamthorsen/toolbelt.errors';

/** Filesystem errors that skip one directory rather than ending the whole walk. */
const SKIPPABLE_ERROR_CODES = new Set(['EACCES', 'ENOENT', 'EPERM']);

/** Reports whether a filesystem failure is one that a read may treat as an empty directory. */
export function isSkippableFilesystemError(error: unknown): boolean {
  return isNodeError(error) && error.code !== undefined && SKIPPABLE_ERROR_CODES.has(error.code);
}

// region | Helpers

/** Reports whether an error is a Node.js filesystem error, which is one with a `code`. */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return isError(error) && 'code' in error;
}

// endregion | Helpers
