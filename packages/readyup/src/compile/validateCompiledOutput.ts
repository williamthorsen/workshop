import { chainError } from '@williamthorsen/toolbelt.errors/candidate';

import { assertIsRdyKit } from '../kits/assertIsRdyKit.ts';
import { importKitModule } from '../kits/importKitModule.ts';
import { resolveKitExports } from '../kits/resolveKitExports.ts';
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
 * Leaves the imported file on disk whatever the outcome. A failure names `bundlePath`, the path at which the bundle
 * is published, which differs from `modulePath` while the bundle is staged under another name.
 */
export async function validateCompiledOutput(
  modulePath: string,
  bundlePath: string = modulePath,
): Promise<KitMetadata> {
  let moduleRecord: Record<string, unknown>;
  try {
    moduleRecord = await importKitModule(modulePath);
  } catch (error: unknown) {
    throw chainError('Failed to load compiled output for validation', error);
  }

  const kit: unknown = resolveKitExports(moduleRecord);
  assertIsRdyKit(kit, toDisplayPath(bundlePath));
  validateKit(kit);

  return {
    checklists: kit.checklists.map((checklist) => checklist.name),
    description: kit.description,
  };
}
