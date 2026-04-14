import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { RdyManifest } from './manifestSchema.ts';
import { ManifestSchema } from './manifestSchema.ts';

/**
 * Validate and write a manifest to disk as formatted JSON.
 *
 * Creates parent directories as needed. Throws on invalid manifest data.
 */
export function writeManifest(manifestPath: string, manifest: RdyManifest): void {
  const result = ManifestSchema.safeParse(manifest);
  if (!result.success) {
    throw new Error(`Invalid manifest data: ${result.error.message}`);
  }

  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(result.data, null, 2) + '\n', 'utf8');
}
