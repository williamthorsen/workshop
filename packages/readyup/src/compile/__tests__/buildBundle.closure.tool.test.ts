import path from 'node:path';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { buildBundle } from '../buildBundle.ts';
import type { CompiledInput } from '../CompiledInput.ts';

const KIT_SOURCE = [
  `import { pickJson } from '${path.resolve(import.meta.dirname, '../pickJson.ts')}';`,
  `import { helper } from './helper.ts';`,
  `import { tiny } from 'tiny-dep';`,
  '',
  `export const meta = pickJson('./data.json', ['version']);`,
  'export const kit = { helper, meta, tiny };',
].join('\n');

const HELPER_SOURCE = "export const helper = 'helper';\n";

const DATA_JSON = JSON.stringify({ name: 'fixture', version: '1.0.0' }, null, 2);

const it = baseIt
  .extend(
    'temp',
    { scope: 'file' },
    makeFixture(() =>
      createTempTree(
        {
          'data.json': DATA_JSON,
          'helper.ts': HELPER_SOURCE,
          'kit.ts': KIT_SOURCE,
          'node_modules/tiny-dep/index.js': 'export const tiny = 1;\n',
          'node_modules/tiny-dep/package.json': JSON.stringify({ name: 'tiny-dep', version: '1.0.0' }),
          // Anchors the compile on the fixture's own root rather than on whichever ancestor of the OS
          // temporary directory happens to contain a manifest.
          'package.json': JSON.stringify({ name: 'fixture', version: '1.0.0' }),
        },
        { prefix: 'closure-' },
      ),
    ),
  )
  .extend('inputs', { scope: 'file' }, async ({ temp }): Promise<CompiledInput[]> => {
    const { inputs } = await buildBundle(temp.resolve('kit.ts'));

    return inputs;
  });

describe('buildBundle input closure', () => {
  it('records the entry point as a module', ({ inputs, temp }) => {
    expect(inputs).toContainEqual({ hash: expect.any(String), kind: 'module', path: temp.resolve('kit.ts') });
  });

  it('records a relative module inlined by the bundle', ({ inputs, temp }) => {
    expect(inputs).toContainEqual({ hash: expect.any(String), kind: 'module', path: temp.resolve('helper.ts') });
  });

  it('records a projected JSON file as an inline input with its path specifier', ({ inputs, temp }) => {
    expect(inputs).toContainEqual({
      hash: expect.any(String),
      kind: 'inline',
      path: temp.resolve('data.json'),
      paths: ['version'],
    });
  });

  it('records no input from node_modules', ({ inputs }) => {
    expect(inputs.filter((input) => input.path.includes('node_modules'))).toStrictEqual([]);
  });

  it('sorts the closure by path and then by kind', ({ inputs }) => {
    const sorted = inputs.toSorted((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind));

    expect(inputs).toStrictEqual(sorted);
  });

  it('hashes an inline input over the projection rather than over the file', async ({ inputs, temp }) => {
    const before = inputs.find((input) => input.kind === 'inline');
    temp.write('data.json', JSON.stringify({ name: 'renamed', version: '1.0.0' }, null, 2));

    const rebuilt = await buildBundle(temp.resolve('kit.ts'));

    expect(rebuilt.inputs.find((input) => input.kind === 'inline')).toStrictEqual(before);
  });
});
