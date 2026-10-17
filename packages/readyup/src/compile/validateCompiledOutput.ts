import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { chainError } from '@williamthorsen/toolbelt.errors/candidate';

import { assertIsRdyKit } from '../kits/assertIsRdyKit.ts';
import { importKitModule } from '../kits/importKitModule.ts';
import { resolveKitExports } from '../kits/resolveKitExports.ts';
import {
  isFlatChecklist,
  listStaticChildren,
  type RdyCheck,
  type RdyChecklist,
  type RdyKit,
  type RdyStagedChecklist,
} from '../kits/types.ts';
import { validateKit } from '../kits/validateKit.ts';
import type { RdyManifestChecklistChecks } from '../manifest/manifestSchema.ts';
import { toDisplayPath } from '../portable/toDisplayPath.ts';
import { toError } from '../portable/toError.ts';

/**
 * How a kit's recorded checks depend on the directory from which it is imported: the checklists whose check names
 * differ between imports, or the error that the import from another directory threw.
 */
export type DirectoryDependence = { checklists: string[] } | { error: string };

/** Lightweight metadata extracted from a validated kit. */
export interface KitMetadata {
  checklistChecks: RdyManifestChecklistChecks[];
  checklists: string[];
  description?: string | undefined;

  /** Present only when the kit's recorded checks depend on the directory from which it is imported. */
  directoryDependence?: DirectoryDependence | undefined;
}

/**
 * Imports a compiled kit bundle, validates it semantically, and returns the metadata that it yields.
 *
 * Imports the bundle a second time from an empty directory, and reports in `directoryDependence` a kit whose recorded
 * checks differ there or whose import fails there. Such a kit builds its checks from the environment when it loads,
 * so its manifest would describe the compiling directory rather than the kit.
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

  const checklistChecks = listChecklistChecks(kit);
  const directoryDependence = await probeDirectoryDependence(path.resolve(modulePath), checklistChecks);
  return {
    checklistChecks,
    checklists: kit.checklists.map((checklist) => checklist.name),
    description: kit.description,
    ...(directoryDependence !== undefined && { directoryDependence }),
  };
}

// region | Helpers

/** Returns a check's name followed by the names of its declared dependents, depth-first, leaving a builder uncalled. */
function flattenCheckNames(check: RdyCheck): string[] {
  return [check.name, ...listStaticChildren(check).flatMap(flattenCheckNames)];
}

/** Returns each checklist of a kit with the names of its checks. */
function listChecklistChecks(kit: RdyKit): RdyManifestChecklistChecks[] {
  return kit.checklists.map((checklist) => ({ checklist: checklist.name, checks: listCheckNames(checklist) }));
}

/**
 * Returns the names of a checklist's checks in declaration order: preconditions, then the checks or each staged group,
 * with each check followed by its dependents, depth-first.
 */
function listCheckNames(checklist: RdyChecklist | RdyStagedChecklist): string[] {
  const checks = isFlatChecklist(checklist) ? checklist.checks : checklist.groups.flat();
  return [...(checklist.preconditions ?? []), ...checks].flatMap(flattenCheckNames);
}

/** Returns the names of the checklists whose entries differ between two records, each name once. */
function listDifferingChecklists(
  expected: RdyManifestChecklistChecks[],
  actual: RdyManifestChecklistChecks[],
): string[] {
  const names = new Set<string>();
  for (let index = 0; index < Math.max(expected.length, actual.length); index++) {
    const left = expected[index];
    const right = actual[index];
    if (JSON.stringify(left) === JSON.stringify(right)) continue;
    if (left !== undefined) names.add(left.checklist);
    if (right !== undefined) names.add(right.checklist);
  }
  return [...names];
}

/**
 * Imports a bundle from an empty temporary directory and compares its recorded checks with `expected`, returning how
 * they depend on the directory, or `undefined` when they do not.
 *
 * Compiles run one at a time, so changing the process's working directory for the import affects no other compile.
 */
async function probeDirectoryDependence(
  modulePath: string,
  expected: RdyManifestChecklistChecks[],
): Promise<DirectoryDependence | undefined> {
  const originalDir = process.cwd();
  const emptyDir = mkdtempSync(path.join(os.tmpdir(), 'readyup-compile-probe-'));
  try {
    process.chdir(emptyDir);
    const kit: unknown = resolveKitExports(await importKitModule(modulePath));
    assertIsRdyKit(kit);
    const checklists = listDifferingChecklists(expected, listChecklistChecks(kit));
    return checklists.length > 0 ? { checklists } : undefined;
  } catch (error: unknown) {
    return { error: toError(error).message };
  } finally {
    process.chdir(originalDir);
    rmSync(emptyDir, { force: true, recursive: true });
  }
}

// endregion | Helpers
