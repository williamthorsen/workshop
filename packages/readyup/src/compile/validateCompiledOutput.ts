import { rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { chainError } from '@williamthorsen/toolbelt.errors/candidate';

import { assertIsRdyKit } from '../kits/assertIsRdyKit.ts';
import { resolveKitExports } from '../kits/resolveKitExports.ts';
import type { RdyKit } from '../kits/types.ts';
import { validateKit } from '../kits/validateKit.ts';
import { isRecord } from '../portable/isRecord.ts';
import { toDisplayPath } from '../portable/toDisplayPath.ts';

/** Lightweight metadata extracted from a validated kit. */
export interface KitMetadata {
  checklists: string[];
  description?: string | undefined;
}

/**
 * Imports a compiled kit bundle, validates it semantically, and returns the metadata it yields.
 *
 * A validation failure deletes the output file, so no invalid bundle is left on disk.
 */
export async function validateCompiledOutput(outputPath: string): Promise<KitMetadata> {
  const fileUrl = `${pathToFileURL(outputPath).href}?t=${Date.now()}`;
  let imported: unknown;
  try {
    imported = await import(fileUrl);
  } catch (error: unknown) {
    rmSync(outputPath, { force: true });
    throw chainError('Failed to load compiled output for validation', error);
  }

  const moduleRecord = isRecord(imported) ? imported : {};

  let kit: RdyKit;
  try {
    const resolved = resolveKitExports(moduleRecord);
    assertIsRdyKit(resolved, toDisplayPath(outputPath));
    validateKit(resolved);
    kit = resolved;
  } catch (error: unknown) {
    rmSync(outputPath, { force: true });
    throw error;
  }

  return {
    checklists: kit.checklists.map((checklist) => checklist.name),
    description: kit.description,
  };
}
