import { existsSync } from 'node:fs';
import path from 'node:path';

import { assertIsRdyKit } from './assertIsRdyKit.ts';
import { jitiImport } from './jitiImport.ts';
import { resolveKitExports } from './resolveKitExports.ts';
import type { RdyKit } from './types.ts';
import { validateKit } from './validateKit.ts';

/**
 * Load and validate a rdy kit file.
 *
 * Uses jiti to load TypeScript config files at runtime.
 */
export async function loadRdyKit(kitPath: string): Promise<RdyKit> {
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

  const resolved = resolveKitExports(imported);
  assertIsRdyKit(resolved);
  validateKit(resolved);
  return resolved;
}
