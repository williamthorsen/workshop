import { globSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..');

// The projects nmr's shared Vitest config declares. Each name is also the filename infix that selects it.
const TIERS = new Set(['unit', 'tool', 'localhost', 'remote']);

// Two patterns rather than one: `globSync` does not descend into a dot-directory, and honours no option that would
// make it, so a lone `**/__tests__/**` silently misses readyup's kit tests under `.readyup/`. The second pattern
// admits one dot-directory segment, which is as deep as any tree here nests one.
const PATTERNS = ['**/__tests__/**/*.test.{ts,tsx}', '**/.*/**/__tests__/**/*.test.{ts,tsx}'];

// `unit` is a residual project: it collects whatever the named tiers don't claim, and the shared config sets
// `passWithNoTests`. A file whose infix is missing or misspelt therefore runs under `unit` and reports success, so a
// test run cannot distinguish it from a correctly named one.
describe('test-tier infixes', () => {
  it('every collected test file names one of the four tiers', () => {
    const misnamed = collectTestFiles().filter((file) => !TIERS.has(readTierInfix(file)));

    expect(misnamed).toStrictEqual([]);
  });
});

/** Returns the repo-relative path of every test file Vitest collects, in sorted order. */
function collectTestFiles(): string[] {
  const files = globSync(PATTERNS, { cwd: repoRoot, exclude: ['**/node_modules/**', '**/dist/**'] });
  return [...new Set(files)].toSorted();
}

/** Reads the dot-delimited segment immediately before `.test.`, which is the only one a project matches on. */
function readTierInfix(file: string): string {
  return path.basename(file).split('.').at(-3) ?? '';
}
