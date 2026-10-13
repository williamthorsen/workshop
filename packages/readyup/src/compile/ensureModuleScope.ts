import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { isInsideDirectory } from '../portable/isInsideDirectory.ts';
import { isRecord } from '../portable/isRecord.ts';
import { toDisplayPath } from '../portable/toDisplayPath.ts';

/** Content of the scope marker: a bundle is an ES module in a `.js` file, so its scope must declare one. */
const MODULE_SCOPE_MARKER = `${JSON.stringify({ type: 'module' }, null, 2)}\n`;

/**
 * Ensures that the bundle at `outputPath` loads as an ES module, whatever `type` the project declares.
 *
 * The scope root is `outDir` when it contains the bundle, and the bundle's own directory otherwise. The nearest
 * `package.json` between the bundle and that root decides the scope; when none exists, a marker declaring
 * `"type": "module"` is written at the root. An existing `package.json` is never overwritten: One that does not
 * declare `"type": "module"` throws, naming the file and the remedy.
 */
export function ensureModuleScope(outputPath: string, outDir: string): void {
  const resolvedOutputPath = path.resolve(outputPath);
  const resolvedOutDir = path.resolve(outDir);
  const bundleDir = path.dirname(resolvedOutputPath);
  const scopeRoot = isInsideDirectory(resolvedOutDir, resolvedOutputPath) ? resolvedOutDir : bundleDir;

  for (let current = bundleDir; ; current = path.dirname(current)) {
    const manifestPath = path.join(current, 'package.json');
    if (existsSync(manifestPath)) {
      if (!declaresModuleType(manifestPath)) throw new Error(describeBlockingManifest(manifestPath));
      return;
    }
    if (current === scopeRoot) break;
  }

  mkdirSync(scopeRoot, { recursive: true });
  writeFileSync(path.join(scopeRoot, 'package.json'), MODULE_SCOPE_MARKER, 'utf8');
}

// region | Helpers

/** Reports whether a `package.json` parses and declares `"type": "module"`. */
function declaresModuleType(manifestPath: string): boolean {
  try {
    const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
    return isRecord(manifest) && manifest['type'] === 'module';
  } catch {
    return false;
  }
}

/** Returns the error message for a `package.json` that puts a bundle outside an ES-module scope. */
function describeBlockingManifest(manifestPath: string): string {
  return (
    `Compiled kits are ES modules, but ${toDisplayPath(manifestPath)} does not declare "type": "module". ` +
    'Declare it there, or set compile.outDir to a directory of its own.'
  );
}

// endregion | Helpers
