import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildBundle, type InlinedJsonFile } from '../buildBundle.ts';

const KIT_SOURCE = [
  `import { pickJson } from '${path.resolve(import.meta.dirname, '../pickJson.ts')}';`,
  `import dependencyData from 'tiny-dep/data.json' with { type: 'json' };`,
  `import { tiny } from 'tiny-dep';`,
  `import { helper } from './helper.ts';`,
  `import mixed from './mixed.json' with { type: 'json' };`,
  `import pkg from './package.json' with { type: 'json' };`,
  `import settings from './settings.json';`,
  `import shared from './shared.json' with { type: 'json' };`,
  '',
  `const legacy = require('./legacy.json');`,
  '',
  `export const meta = pickJson('./picked.json', ['version']);`,
  'export const kit = { dependencyData, helper, legacy, meta, mixed, pkg, settings, shared, tiny };',
].join('\n');

const HELPER_SOURCE = [
  `import mixed from './mixed.json';`,
  `import shared from './shared.json' with { type: 'json' };`,
  'export const helper = { mixed, shared };',
  '',
].join('\n');

const JSON_CONTENT = JSON.stringify({ name: 'fixture', version: '1.0.0' });

describe('buildBundle inlined JSON', () => {
  let treeRoot: string;
  let inlinedJson: InlinedJsonFile[];
  let stderr: string;

  beforeAll(async () => {
    treeRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'inlined-json-')));
    // Anchors the compile on the fixture's own root rather than on whichever ancestor of the OS
    // temporary directory happens to hold a manifest.
    writeFileSync(path.join(treeRoot, 'package.json'), JSON_CONTENT);
    writeFileSync(path.join(treeRoot, 'kit.ts'), KIT_SOURCE);
    writeFileSync(path.join(treeRoot, 'helper.ts'), HELPER_SOURCE);
    for (const fileName of ['legacy.json', 'mixed.json', 'picked.json', 'settings.json', 'shared.json']) {
      writeFileSync(path.join(treeRoot, fileName), JSON_CONTENT);
    }

    const dependencyDir = path.join(treeRoot, 'node_modules', 'tiny-dep');
    mkdirSync(dependencyDir, { recursive: true });
    writeFileSync(path.join(dependencyDir, 'package.json'), JSON.stringify({ name: 'tiny-dep', version: '1.0.0' }));
    writeFileSync(path.join(dependencyDir, 'data.json'), JSON_CONTENT);
    writeFileSync(path.join(dependencyDir, 'own.json'), JSON_CONTENT);
    writeFileSync(
      path.join(dependencyDir, 'index.js'),
      `import own from './own.json' with { type: 'json' };\nexport const tiny = own;\n`,
    );

    using io = captureStdio();
    ({ inlinedJson } = await buildBundle(path.join(treeRoot, 'kit.ts')));
    stderr = io.stderr;
  });

  afterAll(() => {
    rmSync(treeRoot, { recursive: true, force: true });
  });

  it('lists a JSON file imported with an import attribute', () => {
    expect(inlinedJson).toContainEqual({
      importers: [path.join(treeRoot, 'kit.ts')],
      path: path.join(treeRoot, 'package.json'),
    });
  });

  it('lists a JSON file imported without an import attribute', () => {
    expect(inlinedJson).toContainEqual({
      importers: [path.join(treeRoot, 'kit.ts')],
      path: path.join(treeRoot, 'settings.json'),
    });
  });

  it('lists a JSON file loaded through require()', () => {
    expect(inlinedJson).toContainEqual({
      importers: [path.join(treeRoot, 'kit.ts')],
      path: path.join(treeRoot, 'legacy.json'),
    });
  });

  it('names every module that imports a JSON file, sorted', () => {
    expect(inlinedJson).toContainEqual({
      importers: [path.join(treeRoot, 'helper.ts'), path.join(treeRoot, 'kit.ts')],
      path: path.join(treeRoot, 'shared.json'),
    });
  });

  it('names the importers of a JSON file imported both with and without an import attribute', () => {
    expect(inlinedJson).toContainEqual({
      importers: [path.join(treeRoot, 'helper.ts'), path.join(treeRoot, 'kit.ts')],
      path: path.join(treeRoot, 'mixed.json'),
    });
  });

  it('lists no JSON file from node_modules, whether the kit or a dependency imports it', () => {
    expect(inlinedJson.filter((file) => file.path.includes('node_modules'))).toStrictEqual([]);
  });

  it('lists no pickJson target', () => {
    expect(inlinedJson.map((file) => file.path)).not.toContain(path.join(treeRoot, 'picked.json'));
  });

  it('sorts the files by path', () => {
    const paths = inlinedJson.map((file) => file.path);

    expect(paths).toStrictEqual(paths.toSorted((a, b) => a.localeCompare(b)));
  });

  it('writes nothing to stderr', () => {
    expect(stderr).toBe('');
  });
});
