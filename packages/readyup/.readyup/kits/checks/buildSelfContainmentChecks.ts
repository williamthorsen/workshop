import type { CheckOutcome, RdyCheck } from 'readyup';
import { readFile } from 'readyup/check-utils';

import { listCompiledBundlePaths } from './kit-layout.ts';

/**
 * Module specifiers a compiled kit may import verbatim.
 *
 * Exactly the `external` list `rdy compile` passes to esbuild (see `src/compile/compileConfig.ts`).
 * Anything else -- a bare package name, a relative path -- names a module the consumer's project would
 * have to supply, which is what makes a bundle no longer self-contained.
 */
const ALLOWED_PREFIXES = ['node:', 'readyup/'];
const ALLOWED_SPECIFIERS = ['readyup'];

/**
 * Patterns capturing the module specifier from each import form esbuild emits.
 *
 * A textual scan rather than a parse: matching generated ESM costs one regular expression where
 * parsing would cost a dependency the kit cannot carry. The two statement forms are anchored to the
 * start of a line, which is where esbuild puts every import it hoists, and which is what keeps the
 * scan off specifier-shaped text in a comment -- esbuild preserves comments inside an expression, so
 * a scan that read anywhere on a line would report a documented example as a real import.
 */
const SPECIFIER_PATTERNS = [
  // An import or re-export statement, whose specifier follows the clause and the `from` keyword
  /^[ \t]*(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']/gm,
  // A side-effect-only import, which carries no clause before the specifier
  /^[ \t]*import\s+["']([^"']+)["']/gm,
  // A dynamic import, which is an expression and so can sit anywhere on a line
  /\bimport\s*\(\s*["']([^"']+)["']/g,
];

/**
 * One check per compiled bundle, asserting it imports nothing the runner does not supply.
 *
 * A project with nothing compiled has nothing to publish; the single skipped check says so rather than
 * reporting a clean pass over an empty set.
 */
export function buildSelfContainmentChecks(): RdyCheck[] {
  const bundlePaths = listCompiledBundlePaths();
  if (bundlePaths.length === 0) {
    return [
      {
        name: 'every compiled kit imports only what the runner supplies',
        skip: () => 'nothing compiled',
        check: () => true,
      },
    ];
  }

  return bundlePaths.map((bundlePath) => ({
    name: `${bundlePath} imports only what the runner supplies`,
    check: () => describeSelfContainment(bundlePath),
    fix: 'Move the imported code into the kit source, where esbuild inlines it into the bundle',
  }));
}

/** Specifiers a compiled bundle imports that `rdy compile` would not have left unbundled. */
export function findForeignSpecifiers(bundle: string): string[] {
  return scanImportSpecifiers(bundle)
    .filter((specifier) => !isAllowedSpecifier(specifier))
    .toSorted();
}

// region | Helpers

/** Reports the specifiers that keep a bundle from standing on its own. */
function describeSelfContainment(bundlePath: string): CheckOutcome {
  const bundle = readFile(bundlePath);
  if (bundle === undefined) return { ok: false, detail: `${bundlePath} is missing` };

  const foreign = findForeignSpecifiers(bundle);
  if (foreign.length === 0) return { ok: true };
  return { ok: false, detail: `imports ${foreign.join(', ')}` };
}

/** Returns true when a specifier is one esbuild was told to leave external. */
function isAllowedSpecifier(specifier: string): boolean {
  return ALLOWED_SPECIFIERS.includes(specifier) || ALLOWED_PREFIXES.some((prefix) => specifier.startsWith(prefix));
}

/** Every distinct module specifier the bundle text imports. */
function scanImportSpecifiers(bundle: string): string[] {
  const specifiers = new Set<string>();
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of bundle.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) specifiers.add(specifier);
    }
  }
  return [...specifiers];
}

// endregion | Helpers
