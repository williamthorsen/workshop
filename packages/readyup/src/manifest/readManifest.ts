import { readFileSync } from 'node:fs';

import type { RdyManifest } from './manifestSchema.ts';
import { ManifestSchema } from './manifestSchema.ts';

/**
 * Read and validate a manifest file from disk.
 *
 * Throws on missing file, invalid JSON, or schema-invalid content.
 */
export function readManifest(manifestPath: string): RdyManifest {
  let raw: string;
  try {
    raw = readFileSync(manifestPath, 'utf8');
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`Manifest file not found: ${manifestPath}`);
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
