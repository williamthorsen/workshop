import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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

describe('buildBundle input closure', () => {
  let treeRoot: string;
  let inputs: CompiledInput[];

  beforeAll(async () => {
    treeRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'closure-')));
    // Anchors the compile on the fixture's own root rather than on whichever ancestor of the OS
    // temporary directory happens to hold a manifest.
    writeFileSync(path.join(treeRoot, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0' }));
    writeFileSync(path.join(treeRoot, 'kit.ts'), KIT_SOURCE);
    writeFileSync(path.join(treeRoot, 'helper.ts'), HELPER_SOURCE);
    writeFileSync(path.join(treeRoot, 'data.json'), DATA_JSON);

    const dependencyDir = path.join(treeRoot, 'node_modules', 'tiny-dep');
    mkdirSync(dependencyDir, { recursive: true });
    writeFileSync(path.join(dependencyDir, 'package.json'), JSON.stringify({ name: 'tiny-dep', version: '1.0.0' }));
    writeFileSync(path.join(dependencyDir, 'index.js'), 'export const tiny = 1;\n');

    ({ inputs } = await buildBundle(path.join(treeRoot, 'kit.ts')));
  });

  afterAll(() => {
    rmSync(treeRoot, { recursive: true, force: true });
  });

  it('records the entry point as a module', () => {
    expect(inputs).toContainEqual({ hash: expect.any(String), kind: 'module', path: path.join(treeRoot, 'kit.ts') });
  });

  it('records a relative module the bundle inlined', () => {
    expect(inputs).toContainEqual({ hash: expect.any(String), kind: 'module', path: path.join(treeRoot, 'helper.ts') });
  });

  it('records a projected JSON file as an inline input carrying its path specifier', () => {
    expect(inputs).toContainEqual({
      hash: expect.any(String),
      kind: 'inline',
      path: path.join(treeRoot, 'data.json'),
      paths: ['version'],
    });
  });

  it('records nothing from node_modules', () => {
    expect(inputs.filter((input) => input.path.includes('node_modules'))).toStrictEqual([]);
  });

  it('sorts the closure by path and then by kind', () => {
    const sorted = inputs.toSorted((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind));

    expect(inputs).toStrictEqual(sorted);
  });

  it('hashes an inline input over the projection rather than over the file', async () => {
    const before = inputs.find((input) => input.kind === 'inline');
    writeFileSync(path.join(treeRoot, 'data.json'), JSON.stringify({ name: 'renamed', version: '1.0.0' }, null, 2));

    const rebuilt = await buildBundle(path.join(treeRoot, 'kit.ts'));

    expect(rebuilt.inputs.find((input) => input.kind === 'inline')).toStrictEqual(before);
  });
});
