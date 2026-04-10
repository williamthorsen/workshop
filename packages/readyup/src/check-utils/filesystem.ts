import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { CheckOutcome } from '../types.ts';
import { missingFrom } from './missingFrom.ts';

/** Regex matching only safe command names (alphanumeric, dash, underscore, dot). */
const SAFE_COMMAND_NAME = /^[a-zA-Z0-9._-]+$/;

/** Check whether a file exists relative to the working directory. */
export function fileExists(relativePath: string): boolean {
  return existsSync(join(process.cwd(), relativePath));
}

/** Read a file relative to the working directory. Return undefined if it doesn't exist. */
export function readFile(relativePath: string): string | undefined {
  const fullPath = join(process.cwd(), relativePath);
  if (!existsSync(fullPath)) return undefined;
  return readFileSync(fullPath, 'utf8');
}

/** Check whether a file contains content matching a regex. */
export function fileContains(relativePath: string, pattern: RegExp): boolean {
  const content = readFile(relativePath);
  if (content === undefined) return false;
  return pattern.test(content);
}

/** Check that a file does not contain content matching a regex. Pass if the file is absent. */
export function fileDoesNotContain(relativePath: string, pattern: RegExp): boolean {
  const content = readFile(relativePath);
  if (content === undefined) return true;
  return !pattern.test(content);
}

/** Check whether all specified files exist, with optional base directory. */
export function filesExist(paths: string[], options?: { baseDir?: string }): CheckOutcome {
  const base = options?.baseDir ? join(process.cwd(), options.baseDir) : process.cwd();
  const presentPaths = paths.filter((p) => existsSync(join(base, p)));
  return missingFrom('files', paths, presentPaths);
}

/** Check whether a command is available on PATH. Rejects names with shell metacharacters. */
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
