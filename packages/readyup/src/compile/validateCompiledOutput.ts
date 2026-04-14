import { rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { assertIsRdyKit } from '../assertIsRdyKit.ts';
import { isRecord } from '../isRecord.ts';
import { resolveKitExports } from '../resolveKitExports.ts';
import type { RdyKit } from '../types.ts';
import { extractMessage } from '../utils/error-handling.ts';
import { validateKit } from '../validateKit.ts';

/** Lightweight metadata extracted from a validated kit. */
export interface KitMetadata {
  description?: string;
}

/**
 * Import a compiled kit bundle and run semantic validation.
 *
 * Returns metadata extracted from the validated kit. Deletes the output file when validation
 * fails so the user isn't left with an invalid bundle.
 */
export async function validateCompiledOutput(outputPath: string): Promise<KitMetadata> {
  const fileUrl = `${pathToFileURL(outputPath).href}?t=${Date.now()}`;
  let imported: unknown;
  try {
    imported = await import(fileUrl);
  } catch (error: unknown) {
    rmSync(outputPath, { force: true });
    const detail = extractMessage(error);
    throw new Error(`Failed to load compiled output for validation: ${detail}`);
  }

  const moduleRecord = isRecord(imported) ? imported : {};

  let kit: RdyKit;
  try {
    const resolved = resolveKitExports(moduleRecord);
    assertIsRdyKit(resolved);
    validateKit(resolved);
    kit = resolved;
  } catch (error: unknown) {
    rmSync(outputPath, { force: true });
    throw error;
  }

  return {
    description: kit.description,
  };
}
