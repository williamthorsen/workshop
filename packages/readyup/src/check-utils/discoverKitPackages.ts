import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { resolvePackageRoot } from '../installed-packages/resolvePackageRoot.ts';
import { KITS_DIR } from '../kits/kitsDir.ts';
import { enumerateKits } from '../list/enumerateKits.ts';
import { isRecord } from '../portable/isRecord.ts';

/** Manifest fields a kit-carrying dependency can be declared in. */
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies'];

/**
 * Names the installed direct dependencies that publish kits, sorted.
 *
 * Reads the project's declared dependencies rather than sweeping `node_modules`, which bounds the work to
 * packages the reader already chose to depend on and keeps every answer actionable: a transitive package
 * is not one they can sensibly add to a list of their own.
 *
 * Best effort throughout: a project manifest that cannot be read or parsed yields `[]`, which a caller
 * cannot distinguish from a project that declares no kit-publishing dependencies.
 */
export function discoverKitPackages(fromDir: string = process.cwd()): string[] {
  // A package may be declared in both dependency fields, which npm permits; the set collapses the pair
  // so it is named once.
  const declared = new Set(readDeclaredDependencies(fromDir));
  return [...declared].filter((packageName) => publishesKits(packageName, fromDir)).toSorted();
}

// region | Helpers

/** Reports whether an installed package carries at least one compiled kit. */
function publishesKits(packageName: string, fromDir: string): boolean {
  const root = resolvePackageRoot(packageName, fromDir);
  if (root === undefined) return false;

  try {
    return enumerateKits({ dir: path.join(root, KITS_DIR), extension: '.js' }).length > 0;
  } catch {
    return false;
  }
}

/** Names every dependency the project's manifest declares, across both dependency fields. */
function readDeclaredDependencies(fromDir: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path.join(fromDir, 'package.json'), 'utf8'));
  } catch {
    return [];
  }
  if (!isRecord(parsed)) return [];

  return DEPENDENCY_FIELDS.flatMap((field) => {
    const declared = parsed[field];
    return isRecord(declared) ? Object.keys(declared) : [];
  });
}

// endregion | Helpers
