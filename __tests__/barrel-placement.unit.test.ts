import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..');

// Directories under `src/` that hold test code rather than shipped source.
const NON_SOURCE_DIRS = new Set(['__fixtures__', '__mocks__', '__tests__', 'test-utils']);

// A barrel is permitted only where it backs a published entry point, so an `index.ts` the `exports` map does not name
// is one every importer of a single symbol pays for by loading the whole directory.
describe('barrel placement', () => {
  it('every index.ts under a package src backs an entry in that package exports map', () => {
    const unpublished = collectUnpublishedBarrels();

    expect(unpublished).toStrictEqual([]);
  });
});

// region | Helpers

/**
 * Collects every string anywhere in an `exports` value, which is the set of paths the manifest publishes.
 *
 * Reading the strings rather than the keys covers the bare-string form and the conditional-object form alike, and
 * needs no list of the condition names a manifest may use.
 */
function collectExportTargets(value: unknown, targets = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    targets.add(value);
  } else if (Array.isArray(value)) {
    for (const entry of value) collectExportTargets(entry, targets);
  } else if (typeof value === 'object' && value !== null) {
    const nested: unknown[] = Object.values(value);
    for (const entry of nested) collectExportTargets(entry, targets);
  }
  return targets;
}

/** Returns the repo-relative path of every source barrel no `exports` entry publishes, in sorted order. */
function collectUnpublishedBarrels(): string[] {
  const unpublished: string[] = [];
  const manifests = globSync('packages/*/package.json', { cwd: repoRoot });
  for (const manifest of manifests) {
    const packageDir = toPosix(path.dirname(manifest));
    // Matching is exact, so a wildcard entry targeting `dist/` would leave the barrels it publishes reported as
    // offenders. No entry here uses one.
    const published = collectExportTargets(readExports(manifest));
    for (const barrel of findBarrels(packageDir)) {
      if (!published.has(deriveCompiledTarget(packageDir, barrel))) unpublished.push(barrel);
    }
  }
  return unpublished.toSorted();
}

/** Returns the `exports` target a barrel compiles to, which is the path an entry must name to publish it. */
function deriveCompiledTarget(packageDir: string, barrel: string): string {
  const withinSrc = toPosix(path.relative(path.join(packageDir, 'src'), barrel));
  return `./dist/esm/${withinSrc.replace(/\.ts$/, '.js')}`;
}

/** Returns the repo-relative path of every barrel in a package's shipped source. */
function findBarrels(packageDir: string): string[] {
  const found = globSync(`${packageDir}/src/**/index.ts`, { cwd: repoRoot });
  return found.map(toPosix).filter((file) => file.split('/').every((segment) => !NON_SOURCE_DIRS.has(segment)));
}

/** Reads a manifest's `exports` value, or undefined where it declares none. */
function readExports(manifest: string): unknown {
  const parsed: unknown = JSON.parse(readFileSync(path.join(repoRoot, manifest), 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || !('exports' in parsed)) return undefined;
  return parsed.exports;
}

/** Rewrites a path to POSIX separators, so a comparison against a manifest's forward-slash targets holds. */
function toPosix(file: string): string {
  return file.split('\\').join('/');
}

// endregion | Helpers
