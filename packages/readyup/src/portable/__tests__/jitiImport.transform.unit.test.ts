import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { jitiImport } from '../jitiImport.ts';

const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'jiti-import-' })),
);

describe('jitiImport with transformSource', () => {
  it('evaluates the rewritten source', async ({ temp }) => {
    const modulePath = writeModule(temp.dir, 'module.ts', 'export const value: string = PLACEHOLDER;');

    const imported = await jitiImport(modulePath, '', 'Module', {
      transformSource: (source) => source.replace('PLACEHOLDER', '"rewritten"'),
    });

    expect(imported['value']).toBe('rewritten');
  });

  it('rewrites each module that the entry imports', async ({ temp }) => {
    writeModule(temp.dir, 'helper.ts', 'export const helperValue = PLACEHOLDER;');
    const modulePath = writeModule(temp.dir, 'module.ts', "export { helperValue } from './helper.ts';");

    const imported = await jitiImport(modulePath, '', 'Module', {
      transformSource: (source) => source.replace('PLACEHOLDER', '42'),
    });

    expect(imported['helperValue']).toBe(42);
  });

  it('returns a new rewrite on a later import of an unchanged source', async ({ temp }) => {
    const modulePath = writeModule(temp.dir, 'module.ts', 'export const value = PLACEHOLDER;');

    await jitiImport(modulePath, '', 'Module', { transformSource: (source) => source.replace('PLACEHOLDER', '1') });
    const imported = await jitiImport(modulePath, '', 'Module', {
      transformSource: (source) => source.replace('PLACEHOLDER', '2'),
    });

    expect(imported['value']).toBe(2);
  });

  it('propagates an error thrown by the rewrite with its message unchanged', async ({ temp }) => {
    const modulePath = writeModule(temp.dir, 'module.ts', 'export const value = 1;');

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
