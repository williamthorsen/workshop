import path from 'node:path';

import type { CheckOutcome } from 'readyup';

import { KITS_DIR, readManifestEntries, resolveRecordedPath } from './kit-layout.ts';

/**
 * Whether every kit the manifest records sits where a consumer resolves it.
 *
 * `--from npm:<package>` composes a kit's path from its name alone, as `<package>/.readyup/kits/<name>.js`,
 * and never reads the `path` the manifest recorded. A bundle compiled anywhere else is listable and
 * unloadable: it appears in `rdy list --from npm:`, and running it fails to find the file.
 */
export function describeLoadablePaths(): CheckOutcome {
  const misplaced = readManifestEntries().flatMap((entry) => {
    if (entry.path === undefined) return [];
    const recorded = resolveRecordedPath(entry.path);
    return recorded === buildLoadPath(entry.name) ? [] : [`${entry.name} at ${recorded}`];
  });

  if (misplaced.length === 0) return { ok: true };
  return { ok: false, detail: misplaced.join(', ') };
}

// region | Helpers

/** Path `--from npm:` composes for a kit of the given name. */
function buildLoadPath(kitName: string): string {
  return path.join(KITS_DIR, `${kitName}.js`);
}

// endregion | Helpers
