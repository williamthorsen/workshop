import path from 'node:path';
import process from 'node:process';

import type { RdyManifest } from '../manifest/manifestSchema.ts';
import { ManifestNotFoundError, readManifest } from '../manifest/readManifest.ts';
import type { JsonListKitEntry } from '../schemas/listOutputSchema.ts';
import { buildManifestEntry } from './buildManifestEntry.ts';
import { enumerateKits } from './enumerateKits.ts';

interface CollectCompiledKitsOptions {
  /** Absolute path at which the project's manifest belongs, whether or not one sits there. */
  manifestPath: string;
  /** Receives the failure of a manifest that exists and cannot be read, which is then read as absent. */
  onUnreadableManifest: (error: unknown) => void;
  /** Absolute path of the project's `compile.outDir`. */
  outDir: string;
  /** The sweep-relative directory recorded on each row of a repo-wide listing. */
  project?: string;
}

/**
 * Returns a project's compiled kits, preferring its manifest and falling back to the bundles in its output directory.
 *
 * The manifest is where the descriptions live, and a project compiled with `--skip-manifest` still has kits worth
 * naming. An output directory that does not exist yields no rows; any other failure to read it is thrown.
 */
export function collectCompiledKits({
  manifestPath,
  onUnreadableManifest,
  outDir,
  project,
}: CollectCompiledKitsOptions): JsonListKitEntry[] {
  const manifest = readManifestIfReadable(manifestPath, onUnreadableManifest);
  if (manifest !== undefined) {
    const manifestDir = path.dirname(manifestPath);
    return manifest.kits.map((kit) => buildManifestEntry(kit, manifestDir, project));
  }

  return enumerateKits({ dir: outDir, extension: '.js', recursive: true }).map((name) => ({
    name,
    kind: 'compiled',
    ...(project !== undefined && { project }),
    path: path.relative(process.cwd(), path.join(outDir, `${name}.js`)),
  }));
}

// region | Helpers

/** Reads a manifest, returning `undefined` for one that is absent or that cannot be read. */
function readManifestIfReadable(
  manifestPath: string,
  onUnreadableManifest: (error: unknown) => void,
): RdyManifest | undefined {
  try {
    return readManifest(manifestPath);
  } catch (error: unknown) {
    if (!(error instanceof ManifestNotFoundError)) onUnreadableManifest(error);
    return undefined;
  }
}

// endregion | Helpers
