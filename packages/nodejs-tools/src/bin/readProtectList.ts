import fs from 'node:fs';
import path from 'node:path';

import { UsageError } from '@williamthorsen/toolbelt.cli/candidate';
import { describeError } from '@williamthorsen/toolbelt.errors';

/**
 * Reads a protect-list file. A missing file yields no entries when it is the default path and is a usage error when
 * the caller named it, since a mistyped path would otherwise remove every protection.
 *
 * @internal
 */
export function readProtectList(options: ReadProtectListOptions): ProtectList {
  const { explicit, filePath, homeDir } = options;

  let text: string;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (isErrorCode(error, 'ENOENT') && !explicit) return { entries: [], found: false };
    if (isErrorCode(error, 'ENOENT')) throw new UsageError(`Protect-list not found: ${filePath}`, { cause: error });

    throw new UsageError(`Cannot read protect-list ${filePath}: ${describeError(error)}`, { cause: error });
  }

  return { entries: parseProtectList(text, homeDir), found: true };
}

/**
 * Parses protect-list text into its patterns, skipping blank lines and `#` comments. A pattern must be absolute or
 * start with `~`, which expands to `homeDir`.
 *
 * @internal
 */
export function parseProtectList(text: string, homeDir: string): ProtectEntry[] {
  const entries: ProtectEntry[] = [];

  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const pattern = rawLine.trim();
    if (pattern === '' || pattern.startsWith('#')) continue;

    const expanded = expandHome(pattern, homeDir);
    if (!path.isAbsolute(expanded)) {
      throw new UsageError(`Protect-list line ${index + 1} is neither absolute nor ~-prefixed: ${pattern}`);
    }
    entries.push({ glob: trimTrailingSlashes(expanded), pattern });
  }

  return entries;
}

export interface ProtectEntry {
  /** The pattern with `~` expanded, as matched against absolute paths. */
  readonly glob: string;
  /** The pattern as written in the file. */
  readonly pattern: string;
}

export interface ProtectList {
  readonly entries: readonly ProtectEntry[];
  /** Whether the file exists. */
  readonly found: boolean;
}

export interface ReadProtectListOptions {
  /** Whether the user named the file, rather than it being the default path. */
  readonly explicit: boolean;
  readonly filePath: string;
  readonly homeDir: string;
}

// region | Helpers

/** Expands a leading `~` segment to the home directory. */
function expandHome(pattern: string, homeDir: string): string {
  if (pattern === '~') return homeDir;
  if (pattern.startsWith('~/')) return path.join(homeDir, pattern.slice(2));

  return pattern;
}

/** Reports whether a thrown value is a system error with the given code. */
function isErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

/** Removes trailing slashes, keeping a lone root slash. */
function trimTrailingSlashes(glob: string): string {
  const trimmed = glob.replace(/\/+$/, '');

  return trimmed === '' ? '/' : trimmed;
}

// endregion | Helpers
