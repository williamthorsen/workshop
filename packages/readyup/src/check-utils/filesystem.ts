import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
