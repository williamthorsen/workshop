import { chainError } from '@williamthorsen/toolbelt.errors/candidate';

import { assertIsRdyKit } from '../kits/assertIsRdyKit.ts';
import { importKitModule } from '../kits/importKitModule.ts';
import { resolveKitExports } from '../kits/resolveKitExports.ts';
import {
  isFlatChecklist,
  listStaticChildren,
  type RdyCheck,
  type RdyChecklist,
  type RdyStagedChecklist,
} from '../kits/types.ts';
import { validateKit } from '../kits/validateKit.ts';
import type { RdyManifestChecklistChecks } from '../manifest/manifestSchema.ts';
import { toDisplayPath } from '../portable/toDisplayPath.ts';

/** Lightweight metadata extracted from a validated kit. */
export interface KitMetadata {
  checklistChecks: RdyManifestChecklistChecks[];
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
    checklistChecks: kit.checklists.map((checklist) => ({
      checklist: checklist.name,
      checks: listCheckNames(checklist),
    })),
    checklists: kit.checklists.map((checklist) => checklist.name),
    description: kit.description,
  };
}

// region | Helpers

/**
 * Returns the names of a checklist's checks in declaration order: preconditions, then the checks or each staged group,
 * with each check followed by its dependents, depth-first.
 */
function listCheckNames(checklist: RdyChecklist | RdyStagedChecklist): string[] {
  const checks = isFlatChecklist(checklist) ? checklist.checks : checklist.groups.flat();
  return [...(checklist.preconditions ?? []), ...checks].flatMap(flattenCheckNames);
}

/** Returns a check's name followed by the names of its declared dependents, depth-first, leaving a builder uncalled. */
function flattenCheckNames(check: RdyCheck): string[] {
  return [check.name, ...listStaticChildren(check).flatMap(flattenCheckNames)];
}

// endregion | Helpers
