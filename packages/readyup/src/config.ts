import { existsSync } from 'node:fs';
import path from 'node:path';

import { assertIsRdyKit } from './assertIsRdyKit.ts';
import { jitiImport } from './jitiImport.ts';
import { resolveKitExports } from './resolveKitExports.ts';
import type { RdyKit } from './types.ts';
import { validateKit } from './validateKit.ts';

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
    if (kitPath.startsWith('.readyup/kits/')) {
      const baseName = path.basename(kitPath, '.ts');
      throw new Error(`Kit "${baseName}" not found. Run 'rdy init' to create one.`);
    }
    throw new Error(`Kit not found: ${kitPath}`);
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

/** Narrow `__readyupVersion` from an imported module namespace to a string, or undefined. */
function readCompileTimeVersion(moduleRecord: Record<string, unknown>): string | undefined {
  const value = moduleRecord.__readyupVersion;
  return typeof value === 'string' ? value : undefined;
}
