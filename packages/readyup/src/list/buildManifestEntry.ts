import path from 'node:path';
import process from 'node:process';

import type { RdyManifestKit } from '../manifest/manifestSchema.ts';
import type { JsonListKitEntry } from '../schemas/listOutputSchema.ts';

/**
 * Returns a kit row built from a manifest entry.
 *
 * Every field but `name` and `kind` comes from the manifest, so a kit compiled by an older readyup
 * simply has fewer of them. `checklists` is read here rather than from the kit itself: Listing
 * kits runs no kit code, because it never imports a compiled bundle.
 *
 * `manifestDir` rebases the recorded path onto the current directory, which lets a consumer pass it
 * directly to `rdy run --file`. Pass `undefined` for a manifest that is not on this machine.
 *
 * `project` names the directory in which a repo-wide sweep found the kit. Pass `undefined` for a listing
 * that reads one project.
 */
export function buildManifestEntry(
  kit: RdyManifestKit,
  manifestDir: string | undefined,
  project?: string,
): JsonListKitEntry {
  const entry: JsonListKitEntry = { name: kit.name, kind: 'compiled' };

  if (project !== undefined) entry.project = project;
  if (kit.path !== undefined) {
    entry.path =
      manifestDir === undefined ? kit.path : path.relative(process.cwd(), path.resolve(manifestDir, kit.path));
  }
  if (kit.checklists !== undefined) entry.checklists = kit.checklists;
  if (kit.description !== undefined) entry.description = kit.description;
  if (kit.readyupVersion !== undefined) entry.readyupVersion = kit.readyupVersion;

  return entry;
}
