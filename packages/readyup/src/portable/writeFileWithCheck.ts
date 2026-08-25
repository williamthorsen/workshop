import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';

/** Outcome of a `writeFileWithCheck` call. */
export type WriteOutcome = 'created' | 'overwritten' | 'up-to-date' | 'skipped' | 'failed';

/** Result returned by `writeFileWithCheck`. */
export interface WriteResult {
  filePath: string;
  outcome: WriteOutcome;
  error?: string;
}

/** Returns `content` with trailing whitespace stripped from each line and from the end of the file. */
function normalizeTrailingWhitespace(content: string): string {
  return content
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trimEnd();
}

/**
 * Writes a file, reporting what the write did to what was already there.
 *
 * Parent directories are created as needed, and an existing file counts as up to date when its
 * content matches once trailing whitespace is normalized. A dry run reports the outcome a real one
 * would produce and writes nothing. A filesystem error is returned as `{ outcome: 'failed' }` rather
 * than thrown.
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
      const message = describeError(error);
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
    const message = describeError(error);
    return { filePath, outcome: 'failed', error: message };
  }

  try {
    writeFileSync(filePath, content, 'utf8');
  } catch (error: unknown) {
    const message = describeError(error);
    return { filePath, outcome: 'failed', error: message };
  }

  return { filePath, outcome };
}
