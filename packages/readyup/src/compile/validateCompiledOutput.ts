import { rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { assertIsRdyKit } from '../assertIsRdyKit.ts';
import { isRecord } from '../isRecord.ts';
import { resolveKitExports } from '../resolveKitExports.ts';
import { validateKit } from '../validateKit.ts';

/**
 * Import a compiled kit bundle and run semantic validation.
 *
 * Deletes the output file when validation fails so the user isn't left with an invalid bundle.
 */
export async function validateCompiledOutput(outputPath: string): Promise<void> {
  const fileUrl = `${pathToFileURL(outputPath).href}?t=${Date.now()}`;
  let imported: unknown;
  try {
    imported = await import(fileUrl);
  } catch (error: unknown) {
    rmSync(outputPath, { force: true });
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load compiled output for validation: ${detail}`);
  }

  const moduleRecord = isRecord(imported) ? imported : {};

  try {
    const resolved = resolveKitExports(moduleRecord);
    assertIsRdyKit(resolved);
    validateKit(resolved);
  } catch (error: unknown) {
    rmSync(outputPath, { force: true });
    throw error;
  }
}
