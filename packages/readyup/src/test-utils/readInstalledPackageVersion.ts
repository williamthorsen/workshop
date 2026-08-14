import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { isRecord } from '../portable/isRecord.ts';

/** Reads the version of a package as this package resolves it, which is the one a compile here inlines. */
export function readInstalledPackageVersion(name: string): string {
  const require = createRequire(import.meta.url);
  const parsed: unknown = JSON.parse(readFileSync(require.resolve(`${name}/package.json`), 'utf8'));
  if (!isRecord(parsed) || typeof parsed['version'] !== 'string') {
    throw new Error(`${name}/package.json declares no readable version`);
  }
  return parsed['version'];
}
