import path from 'node:path';

import { captureStdio, createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { buildBundle, type InlinedJsonFile } from '../buildBundle.ts';

const KIT_SOURCE = [
  `import { pickJson } from '${path.resolve(import.meta.dirname, '../pickJson.ts')}';`,
  `import dependencyData from 'tiny-dep/data.json' with { type: 'json' };`,
  `import { tiny } from 'tiny-dep';`,
  `import data from './data.jsonc' with { type: 'json' };`,
  `import { helper } from './helper.ts';`,
  `import mixed from './mixed.json' with { type: 'json' };`,
  `import pkg from './package.json' with { type: 'json' };`,
  `import settings from './settings.json';`,
  `import shared from './shared.json' with { type: 'json' };`,
  '',
  `const legacy = require('./legacy.json');`,
  '',
  `export const meta = pickJson('./picked.json', ['version']);`,
  'export const kit = { data, dependencyData, helper, legacy, meta, mixed, pkg, settings, shared, tiny };',
].join('\n');

const HELPER_SOURCE = [
  `import mixed from './mixed.json';`,
  `import shared from './shared.json' with { type: 'json' };`,
  'export const helper = { mixed, shared };',
  '',
].join('\n');

const JSON_CONTENT = JSON.stringify({ name: 'fixture', version: '1.0.0' });

const PLAIN_JSON_FILES = ['data.jsonc', 'legacy.json', 'mixed.json', 'picked.json', 'settings.json', 'shared.json'];

const it = baseIt
  .extend(
    'temp',
    { scope: 'file' },
    makeFixture(() =>
      createTempTree(
        {
          'helper.ts': HELPER_SOURCE,
          'kit.ts': KIT_SOURCE,
          'node_modules/tiny-dep/data.json': JSON_CONTENT,
          'node_modules/tiny-dep/index.js': `import own from './own.json' with { type: 'json' };\nexport const tiny = own;\n`,
          'node_modules/tiny-dep/own.json': JSON_CONTENT,
          'node_modules/tiny-dep/package.json': JSON.stringify({ name: 'tiny-dep', version: '1.0.0' }),
          // Anchors the compile on the fixture's own root rather than on whichever ancestor of the OS
          // temporary directory happens to contain a manifest.
          'package.json': JSON_CONTENT,

          ...Object.fromEntries(PLAIN_JSON_FILES.map((fileName) => [fileName, JSON_CONTENT])),
        },
        { prefix: 'inlined-json-' },
      ),
    ),
  )
  .extend('compiled', { scope: 'file' }, async ({ temp }): Promise<CompileRecord> => {
    using io = captureStdio();
    const { inlinedJson } = await buildBundle(temp.resolve('kit.ts'));

    return { inlinedJson, stderr: io.stderr };
  });

/** What the suite's one compile produced: the files that it inlined, and whatever it wrote to stderr. */
interface CompileRecord {
  inlinedJson: InlinedJsonFile[];
  stderr: string;
}

describe('buildBundle inlined JSON', () => {
  it('lists a JSON file imported with an import attribute', ({ compiled, temp }) => {
    expect(compiled.inlinedJson).toContainEqual({
      importers: [temp.resolve('kit.ts')],
      path: temp.resolve('package.json'),
    });
  });

  it('lists a JSON file imported without an import attribute', ({ compiled, temp }) => {
    expect(compiled.inlinedJson).toContainEqual({
      importers: [temp.resolve('kit.ts')],
      path: temp.resolve('settings.json'),
    });
  });

  it('lists a JSON file loaded through require()', ({ compiled, temp }) => {
    expect(compiled.inlinedJson).toContainEqual({
      importers: [temp.resolve('kit.ts')],
      path: temp.resolve('legacy.json'),
    });
  });

  it('lists a file loaded as JSON through an import attribute, whatever its extension', ({ compiled, temp }) => {
    expect(compiled.inlinedJson).toContainEqual({
      importers: [temp.resolve('kit.ts')],
      path: temp.resolve('data.jsonc'),
    });
  });

  it('names every module that imports a JSON file, sorted', ({ compiled, temp }) => {
    expect(compiled.inlinedJson).toContainEqual({
      importers: [temp.resolve('helper.ts'), temp.resolve('kit.ts')],
      path: temp.resolve('shared.json'),
    });
  });

  it('names the importers of a JSON file imported both with and without an import attribute', ({ compiled, temp }) => {
    expect(compiled.inlinedJson).toContainEqual({
      importers: [temp.resolve('helper.ts'), temp.resolve('kit.ts')],
      path: temp.resolve('mixed.json'),
    });
  });

  it('lists no JSON file from node_modules, whether the kit or a dependency imports it', ({ compiled }) => {
    expect(compiled.inlinedJson.filter((file) => file.path.includes('node_modules'))).toStrictEqual([]);
  });

  it('lists no pickJson target', ({ compiled, temp }) => {
    expect(compiled.inlinedJson.map((file) => file.path)).not.toContain(temp.resolve('picked.json'));
  });

  it('sorts the files by path', ({ compiled }) => {
    const paths = compiled.inlinedJson.map((file) => file.path);

    expect(paths).toStrictEqual(paths.toSorted((a, b) => a.localeCompare(b)));
  });

  it('writes nothing to stderr', ({ compiled }) => {
    expect(compiled.stderr).toBe('');
  });
});
