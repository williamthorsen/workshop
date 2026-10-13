import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { usageError } from '../errors/RdyError.ts';
import type { FromSource } from './parseFromValue.ts';

/** Rejects a local or `dir:` source whose path does not exist, which would otherwise be reported as a missing kit. */
export function assertFromPathExists(source: FromSource): void {
  if (source.type !== 'local' && source.type !== 'directory') return;

  const cwd = process.cwd();
  if (existsSync(path.resolve(cwd, source.path))) return;

  const hint = path.isAbsolute(source.path)
    ? 'Check that the path is spelled correctly.'
    : `A relative path is resolved against ${cwd}; run from the directory that contains it, or give an absolute path.`;
  throw usageError(`Source path "${source.path}" does not exist.`, { hint });
}
