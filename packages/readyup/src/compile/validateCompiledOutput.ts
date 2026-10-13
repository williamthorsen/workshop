import { rmSync } from 'node:fs';

import { chainError } from '@williamthorsen/toolbelt.errors/candidate';

import { assertIsRdyKit } from '../kits/assertIsRdyKit.ts';
import { importKitModule } from '../kits/importKitModule.ts';
import { resolveKitExports } from '../kits/resolveKitExports.ts';
import type { RdyKit } from '../kits/types.ts';
import { validateKit } from '../kits/validateKit.ts';
import { toDisplayPath } from '../portable/toDisplayPath.ts';

/** Lightweight metadata extracted from a validated kit. */
export interface KitMetadata {
  checklists: string[];
  description?: string | undefined;
}

/**
 * Imports a compiled kit bundle, validates it semantically, and returns the metadata that it yields.
 *
 * Deletes the output file when validation fails, so no invalid bundle is left on disk.
 */
export async function validateCompiledOutput(outputPath: string): Promise<KitMetadata> {
  let moduleRecord: Record<string, unknown>;
  try {
    moduleRecord = await importKitModule(outputPath);
  } catch (error: unknown) {
    rmSync(outputPath, { force: true });
    throw chainError('Failed to load compiled output for validation', error);
  }

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
