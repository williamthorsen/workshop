import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { CheckOutcome } from '../kits/types.ts';
import { missingFrom } from './missingFrom.ts';

/** Regex matching only safe command names (alphanumeric, dash, underscore, dot). */
const SAFE_COMMAND_NAME = /^[a-zA-Z0-9._-]+$/;

/** Checks whether a file exists. A relative path resolves against the working directory. */
export function fileExists(filePath: string): boolean {
  return existsSync(resolve(process.cwd(), filePath));
}

/**
 * Reads a file, resolving a relative path against the working directory.
 * Returns undefined if it doesn't exist.
 */
export function readFile(filePath: string): string | undefined {
  const fullPath = resolve(process.cwd(), filePath);
  if (!existsSync(fullPath)) return undefined;
  return readFileSync(fullPath, 'utf8');
}

/** Checks whether a file contains content matching a regex. */
export function fileContains(filePath: string, pattern: RegExp): boolean {
  const content = readFile(filePath);
  if (content === undefined) return false;
  return pattern.test(content);
}

/** Checks that a file does not contain content matching a regex. Passes if the file is absent. */
export function fileDoesNotContain(filePath: string, pattern: RegExp): boolean {
  const content = readFile(filePath);
  if (content === undefined) return true;
  return !pattern.test(content);
}

/** Checks whether all specified files exist, with optional base directory. An absolute path names itself. */
export function filesExist(paths: string[], options?: { baseDir?: string }): CheckOutcome {
  const base = options?.baseDir ? resolve(process.cwd(), options.baseDir) : process.cwd();
  const presentPaths = paths.filter((p) => existsSync(resolve(base, p)));
  return missingFrom('files', paths, presentPaths);
}

/** Checks whether a command is available on PATH. Rejects names with shell metacharacters. */
export function commandExists(name: string): boolean {
  if (!SAFE_COMMAND_NAME.test(name)) {
    return false;
  }
  try {
    execSync(`command -v ${name}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
