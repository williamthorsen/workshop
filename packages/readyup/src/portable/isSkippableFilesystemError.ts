import { isError } from '@williamthorsen/toolbelt.errors';

/** Filesystem errors that cost a read one directory rather than the whole answer. */
const SKIPPABLE_ERROR_CODES = new Set(['EACCES', 'ENOENT', 'EPERM']);

/** Reports whether a filesystem failure is one a read may treat as an empty directory. */
export function isSkippableFilesystemError(error: unknown): boolean {
  return isNodeError(error) && error.code !== undefined && SKIPPABLE_ERROR_CODES.has(error.code);
}

// region | Helpers

/** Reports whether an error is a Node.js filesystem error, which is one with a `code`. */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return isError(error) && 'code' in error;
}

// endregion | Helpers
