import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import * as entry from '../index.ts';

const entryPath = path.join(import.meta.dirname, '../index.ts');

// The entry's own re-export specifiers name every module it publishes from, so the list is read from the source. A
// module declaring only types contributes no runtime member and passes trivially.
const publishedModules = await readPublishedModules();

describe('package entry', () => {
  it.each(publishedModules)('re-exports every runtime member of %s', (_specifier, module) => {
    const exported = new Set(Object.keys(entry));
    const missing = Object.keys(module).filter((name) => !exported.has(name));

    expect(missing).toStrictEqual([]);
  });

  // An empty list would make every case above vanish, leaving the suite green having checked nothing.
  it('finds modules to check', () => {
    expect(publishedModules.length).toBeGreaterThan(0);
  });
});

// region | Helpers

/** Every module the entry re-exports from, paired with its namespace, ordered by specifier. */
async function readPublishedModules(): Promise<Array<readonly [string, Record<string, unknown>]>> {
  const source = await readFile(entryPath, 'utf8');
  const matched = source
    .matchAll(/ from '(\.\/[^']+)'/g)
    .map((match) => match.at(1))
    .filter((specifier) => specifier !== undefined)
    .toArray();
  const specifiers = [...new Set(matched)];

  return Promise.all(
    specifiers.toSorted().map(async (specifier) => {
      const module: Record<string, unknown> = await import(specifier.replace(/^\.\//, '../'));
      return [specifier, module] as const;
    }),
  );
}

// endregion | Helpers
