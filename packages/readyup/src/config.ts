import { existsSync } from 'node:fs';
import path from 'node:path';

import { assertIsRdyKit } from './assertIsRdyKit.ts';
import { jitiImport } from './jitiImport.ts';
import { KITS_DIR } from './kitsDir.ts';
import { enumerateKits } from './list/enumerateKits.ts';
import { resolveKitExports } from './resolveKitExports.ts';
import type { RdyKit } from './types.ts';
import { toDisplayPath } from './utils/display-path.ts';
import { validateKit } from './validateKit.ts';

/** The extension a kit's counterpart carries, keyed by the extension that was requested. */
const SIBLING_EXTENSIONS: Record<string, string> = { '.js': '.ts', '.ts': '.js' };

/** Result of loading a rdy kit: the validated kit plus the compile-time readyup version, if embedded. */
export interface LoadedRdyKit {
  kit: RdyKit;
  compileTimeVersion: string | undefined;
}

/**
 * Load and validate a rdy kit file.
 *
 * Uses jiti to load TypeScript config files at runtime. Returns the validated kit and the
 * embedded `__readyupVersion` from the imported module namespace when present, or `undefined`
 * for kits compiled before that field was introduced (and for `.ts` sources, which have no
 * generated banner).
 */
export async function loadRdyKit(kitPath: string): Promise<LoadedRdyKit> {
  const resolvedPath = path.resolve(process.cwd(), kitPath);

  if (!existsSync(resolvedPath)) {
    throw new Error(diagnoseMissingKit(resolvedPath));
  }

  const imported = await jitiImport(
    resolvedPath,
    'Uncompiled kits require the package to be installed as a project dependency. ' +
      "Alternatively, run 'rdy compile' to produce a self-contained bundle that does not need a local install.",
    'Kit file',
  );

  // Extract __readyupVersion from the raw module namespace before `resolveKitExports` strips it.
  const compileTimeVersion = readCompileTimeVersion(imported);

  const resolved = resolveKitExports(imported);
  assertIsRdyKit(resolved);
  validateKit(resolved);
  return { kit: resolved, compileTimeVersion };
}

/**
 * Compose the error message for a kit path that does not exist.
 *
 * Each branch names the remedy that applies to the state actually found on disk: a source
 * awaiting compilation, a compiled kit requested as source, a project that was never
 * initialized, or a name matching nothing in the directory that was searched.
 */
function diagnoseMissingKit(resolvedPath: string): string {
  const extension = path.extname(resolvedPath);
  const name = path.basename(resolvedPath, extension);
  const dir = path.dirname(resolvedPath);

  const siblingExtension = SIBLING_EXTENSIONS[extension];
  if (siblingExtension !== undefined && existsSync(path.join(dir, `${name}${siblingExtension}`))) {
    return extension === '.js'
      ? `Kit "${name}" is not compiled. Run 'rdy compile' to compile it, or 'rdy run --jit' to run it from source.`
      : `Kit "${name}" has no source at ${toDisplayPath(resolvedPath)}, but a compiled kit exists. ` +
          "Run 'rdy run' without --jit to use it.";
  }

  const available = listAvailableKits(dir, extension);

  // Scaffolding is the remedy only for a project that has no kits at all. A directory holding kits
  // under other names is answered with those names, whichever kit was asked for.
  if (available.length === 0 && name === 'default' && dir === path.resolve(process.cwd(), KITS_DIR)) {
    return `Kit "default" not found at ${toDisplayPath(resolvedPath)}. Run 'rdy init' to create one.`;
  }

  const availability =
    available.length > 0 ? `Available kits: ${available.join(', ')}.` : `No kits found in ${toDisplayPath(dir)}.`;
  return `Kit "${name}" not found at ${toDisplayPath(resolvedPath)}. ${availability}`;
}

/** List the kit names beside a missing kit, treating an unreadable directory as holding none. */
function listAvailableKits(dir: string, extension: string): string[] {
  try {
    return enumerateKits({ dir, extension });
  } catch {
    return [];
  }
}

/** Narrow `__readyupVersion` from an imported module namespace to a string, or undefined. */
function readCompileTimeVersion(moduleRecord: Record<string, unknown>): string | undefined {
  const value = moduleRecord.__readyupVersion;
  return typeof value === 'string' ? value : undefined;
}
