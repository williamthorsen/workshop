import { readFileSync } from 'node:fs';

import { describeError, isError } from '@williamthorsen/toolbelt.errors';

import { configError, RdyError } from '../errors/RdyError.ts';
import { ManifestSchema, type RdyManifest } from './manifestSchema.ts';

/** Thrown when the manifest file does not exist on disk. */
export class ManifestNotFoundError extends RdyError {
  constructor(manifestPath: string) {
    super('config', `Manifest file not found: ${manifestPath}`);
    this.name = 'ManifestNotFoundError';
  }
}

/**
 * Returns a manifest file read from disk and validated.
 *
 * Every failure is a config error: `ManifestNotFoundError` for a missing file, and a plain config `RdyError`, whose
 * `cause` is the underlying error, for an unreadable file, invalid JSON, or a schema failure.
 */
export function readManifest(manifestPath: string): RdyManifest {
  let raw: string;
  try {
    raw = readFileSync(manifestPath, 'utf8');
  } catch (error: unknown) {
    if (isError(error) && 'code' in error && error.code === 'ENOENT') {
      throw new ManifestNotFoundError(manifestPath);
    }
    throw configError(`Failed to read manifest file ${manifestPath}: ${describeError(error)}`, { cause: error });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error: unknown) {
    throw configError(`Manifest file contains invalid JSON: ${manifestPath}: ${describeError(error)}`, {
      cause: error,
    });
  }

  const result = ManifestSchema.safeParse(parsed);
  if (!result.success) {
    throw configError(`Invalid manifest schema in ${manifestPath}: ${result.error.message}`, { cause: result.error });
  }

  return result.data;
}
