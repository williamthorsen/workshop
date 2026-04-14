import { readFileSync } from 'node:fs';

import { ManifestSchema } from './manifestSchema.ts';
import type { RdyManifest } from './manifestSchema.ts';

/**
 * Read and validate a manifest file from disk.
 *
 * Throws on missing file, invalid JSON, or schema-invalid content.
 */
export function readManifest(manifestPath: string): RdyManifest {
  let raw: string;
  try {
    raw = readFileSync(manifestPath, 'utf8');
  } catch {
    throw new Error(`Manifest file not found: ${manifestPath}`);
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
