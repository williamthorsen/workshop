import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Outcome of a `writeFileWithCheck` call. */
export type WriteOutcome = 'created' | 'overwritten' | 'up-to-date' | 'skipped' | 'failed';

/** Result returned by `writeFileWithCheck`. */
export interface WriteResult {
  filePath: string;
  outcome: WriteOutcome;
  error?: string;
}

/** Strip trailing whitespace from each line and from EOF. */
function normalizeTrailingWhitespace(content: string): string {
  return content
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trimEnd();
}

/**
 * Write a file with existence and content checks.
 *
 * Creates parent directories as needed. Compares content using whitespace-normalized comparison
 * to determine whether an existing file is up to date. In dry-run mode, returns the outcome
 * that would happen without performing writes. Filesystem errors are caught and returned as
 * `{ outcome: 'failed' }` rather than thrown.
 */
export function writeFileWithCheck(
  filePath: string,
  content: string,
  options: { dryRun: boolean; overwrite: boolean },
): WriteResult {
  const { dryRun, overwrite } = options;
  const fileExists = existsSync(filePath);

  if (fileExists && !overwrite) {
    try {
      const existing = readFileSync(filePath, 'utf8');
      if (normalizeTrailingWhitespace(existing) === normalizeTrailingWhitespace(content)) {
        return { filePath, outcome: 'up-to-date' };
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { filePath, outcome: 'skipped', error: message };
    }
    return { filePath, outcome: 'skipped' };
  }

  const outcome: WriteOutcome = fileExists ? 'overwritten' : 'created';

  if (dryRun) {
    return { filePath, outcome };
  }

  try {
    mkdirSync(dirname(filePath), { recursive: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { filePath, outcome: 'failed', error: message };
  }

  try {
    writeFileSync(filePath, content, 'utf8');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { filePath, outcome: 'failed', error: message };
  }

  return { filePath, outcome };
}
