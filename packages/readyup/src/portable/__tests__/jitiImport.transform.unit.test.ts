import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { jitiImport } from '../jitiImport.ts';

describe('jitiImport with transformSource', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'jiti-import-'));
  });

  afterEach(() => {
    rmSync(dir, { force: true, recursive: true });
  });

  it('evaluates the rewritten source', async () => {
    const modulePath = writeModule(dir, 'module.ts', 'export const value: string = PLACEHOLDER;');

    const imported = await jitiImport(modulePath, '', 'Module', {
      transformSource: (source) => source.replace('PLACEHOLDER', '"rewritten"'),
    });

    expect(imported['value']).toBe('rewritten');
  });

  it('rewrites each module that the entry imports', async () => {
    writeModule(dir, 'helper.ts', 'export const helperValue = PLACEHOLDER;');
    const modulePath = writeModule(dir, 'module.ts', "export { helperValue } from './helper.ts';");

    const imported = await jitiImport(modulePath, '', 'Module', {
      transformSource: (source) => source.replace('PLACEHOLDER', '42'),
    });

    expect(imported['helperValue']).toBe(42);
  });

  it('returns a new rewrite on a later import of an unchanged source', async () => {
    const modulePath = writeModule(dir, 'module.ts', 'export const value = PLACEHOLDER;');

    await jitiImport(modulePath, '', 'Module', { transformSource: (source) => source.replace('PLACEHOLDER', '1') });
    const imported = await jitiImport(modulePath, '', 'Module', {
      transformSource: (source) => source.replace('PLACEHOLDER', '2'),
    });

    expect(imported['value']).toBe(2);
  });

  it('propagates an error thrown by the rewrite with its message unchanged', async () => {
    const modulePath = writeModule(dir, 'module.ts', 'export const value = 1;');

    await expect(
      jitiImport(modulePath, '', 'Module', {
        transformSource: () => {
          throw new Error('pickJson: Cannot read JSON file "./data.json"');
        },
      }),
    ).rejects.toThrow(/^pickJson: Cannot read JSON file "\.\/data\.json"$/);
  });
});

// region | Helpers

/** Writes a module into `dir` and returns its absolute path. */
function writeModule(dir: string, name: string, contents: string): string {
  const filePath = path.join(dir, name);
  writeFileSync(filePath, contents);
  return filePath;
}

// endregion | Helpers
