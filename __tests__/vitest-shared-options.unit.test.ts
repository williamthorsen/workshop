import { globSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..');

// The specifiers that `vitest.shared.ts` aliases onto readyup's sources. A config omitting the shared layer still
// resolves them, through `node_modules/readyup` to `packages/readyup/dist/`, so readyup's kit tests would pass
// against the last build instead of the working tree and no run would report the substitution.
const ALIASED_SPECIFIERS = ['readyup', 'readyup/check-utils', 'readyup/testing'].toSorted();

// Vitest resolves one config per run, and a package config replaces the root one rather than extending it, so
// every config here has to carry the shared layer for itself.
const CONFIG_PATTERNS = ['vitest*.config.ts', 'packages/*/vitest*.config.ts'];

const CONFIG_PATHS = CONFIG_PATTERNS.flatMap((pattern) => globSync(pattern, { cwd: repoRoot })).toSorted();

describe('every Vitest config', () => {
  it('is found by the sweep', () => {
    expect(CONFIG_PATHS.length).toBeGreaterThan(1);
  });

  it.for(CONFIG_PATHS)('resolves readyup to source in %s', async (relativePath) => {
    const config = await loadConfig(relativePath);

    expect(readAliasedSpecifiers(config)).toStrictEqual(ALIASED_SPECIFIERS);
  });

  it.for(CONFIG_PATHS)('restores stubbed environment variables in %s', async (relativePath) => {
    const config = await loadConfig(relativePath);
    const flags = readUnstubEnvsFlags(config);

    expect(flags.length).toBeGreaterThan(0);
    expect(flags).toStrictEqual(flags.map(() => true));
  });
});

// region | Helpers

/** Imports a config and returns the object to which it resolves. */
async function loadConfig(relativePath: string): Promise<Record<string, unknown>> {
  const imported: unknown = await import(path.join(repoRoot, relativePath));
  const resolved = isRecord(imported) ? imported['default'] : undefined;
  if (!isRecord(resolved)) throw new Error(`${relativePath} exports no config object`);
  return resolved;
}

/** Reports whether a value is a plain object, so a config's shape can be read without an assertion. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Returns the specifiers that a config aliases, sorted. */
function readAliasedSpecifiers(config: Record<string, unknown>): string[] {
  const resolve = config['resolve'];
  if (!isRecord(resolve)) return [];

  const alias = resolve['alias'];
  if (!Array.isArray(alias)) return [];

  return alias
    .map((entry) => (isRecord(entry) ? entry['find'] : undefined))
    .filter((find) => typeof find === 'string')
    .toSorted();
}

/** Returns each declared project's `unstubEnvs` setting, in declaration order. */
function readUnstubEnvsFlags(config: Record<string, unknown>): unknown[] {
  const test = config['test'];
  if (!isRecord(test)) return [];

  const projects = test['projects'];
  if (!Array.isArray(projects)) return [];

  return projects.map((project) => {
    if (!isRecord(project)) return undefined;
    const projectTest = project['test'];
    return isRecord(projectTest) ? projectTest['unstubEnvs'] : undefined;
  });
}

// endregion | Helpers
