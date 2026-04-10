import { readdirSync } from 'node:fs';
import path from 'node:path';

interface EnumerateKitsOptions {
  dir: string;
  extension: string;
}

/**
 * Return sorted base names (extension stripped) of files in `dir` matching `extension`.
 *
 * Non-recursive. Hidden files (starting with `.`) are excluded. Returns `[]` when
 * `dir` does not exist; rethrows other filesystem errors (e.g., `EACCES`).
 */
export function enumerateKits({ dir, extension }: EnumerateKitsOptions): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  return (
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(extension) && !entry.name.startsWith('.'))
      .map((entry) => path.basename(entry.name, extension))
      // eslint-disable-next-line unicorn/no-array-sort
      .sort()
  );
}

/** Type guard for Node.js filesystem errors with a `code` property. */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
