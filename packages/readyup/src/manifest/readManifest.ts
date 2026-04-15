import { readFileSync } from 'node:fs';

import type { RdyManifest } from './manifestSchema.ts';
import { ManifestSchema } from './manifestSchema.ts';

/** Thrown when the manifest file does not exist on disk. */
export class ManifestNotFoundError extends Error {
  constructor(manifestPath: string) {
    super(`Manifest file not found: ${manifestPath}`);
    this.name = 'ManifestNotFoundError';
  }
}

/**
 * Read and validate a manifest file from disk.
 *
 * Throws `ManifestNotFoundError` for missing files, or a plain `Error` for invalid JSON / schema failures.
 */
export function readManifest(manifestPath: string): RdyManifest {
  let raw: string;
  try {
    raw = readFileSync(manifestPath, 'utf8');
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new ManifestNotFoundError(manifestPath);
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read manifest file ${manifestPath}: ${detail}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Manifest file contains invalid JSON: ${manifestPath}`);
  }

  const result = ManifestSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid manifest schema in ${manifestPath}: ${result.error.message}`);
  }

  return result.data;
}
