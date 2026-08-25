import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { BundleResult } from '../buildBundle.ts';
import { buildBundle } from '../buildBundle.ts';

const KIT_SOURCE = [
  `import { pickJson } from '${path.resolve(import.meta.dirname, '../pickJson.ts')}';`,
  `import { helper } from './helper.ts';`,
  `import { tiny } from 'tiny-dep';`,
  '',
  `export const meta = pickJson('./data.json', ['version']);`,
  'export const kit = { helper, meta, tiny };',
].join('\n');

/**
 * Compiles one kit from directories that are neither its own nor each other's, which is the property
 * `rdy verify --rebuild` rests on: it recompiles in whatever directory the verification runs in.
 */
describe('buildBundle reproducibility', () => {
  let treeRoot: string;
  let kitPath: string;
  let fromRepo: BundleResult;
  let fromKitsDir: BundleResult;
  const originalCwd = process.cwd();

  beforeAll(async () => {
    treeRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'reproducibility-')));
    // Anchors the compile on the fixture's own root rather than on whichever ancestor of the OS
    // temporary directory happens to hold a manifest.
    writeFileSync(path.join(treeRoot, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0' }));

    const kitsDir = path.join(treeRoot, 'kits');
    mkdirSync(kitsDir, { recursive: true });
    kitPath = path.join(kitsDir, 'kit.ts');
    writeFileSync(kitPath, KIT_SOURCE);
    writeFileSync(path.join(kitsDir, 'helper.ts'), "export const helper = 'helper';\n");
    writeFileSync(path.join(kitsDir, 'data.json'), JSON.stringify({ name: 'fixture', version: '1.0.0' }));

    const dependencyDir = path.join(treeRoot, 'node_modules', 'tiny-dep');
    mkdirSync(dependencyDir, { recursive: true });
    writeFileSync(path.join(dependencyDir, 'package.json'), JSON.stringify({ name: 'tiny-dep', version: '1.0.0' }));
    writeFileSync(path.join(dependencyDir, 'index.js'), 'export const tiny = 1;\n');

    fromRepo = await buildBundle(kitPath);

    process.chdir(kitsDir);
    try {
      fromKitsDir = await buildBundle(kitPath);
    } finally {
      process.chdir(originalCwd);
    }
  });

  afterAll(() => {
    rmSync(treeRoot, { recursive: true, force: true });
  });

  it('produces identical bytes whatever directory the compile runs in', () => {
    expect(fromKitsDir.bytes.equals(fromRepo.bytes)).toBe(true);
  });

  it('records the same input closure', () => {
    expect(fromKitsDir.inputs).toStrictEqual(fromRepo.inputs);
  });

  it('records the same bundled dependencies', () => {
    expect(fromKitsDir.bundledDependencies).toStrictEqual(fromRepo.bundledDependencies);
  });

  it("names each bundled module against the kit's package root", () => {
    // The bundle is identical under any anchor derived from the kit, so this is what pins the anchor to
    // the one every committed bundle was compiled under.
    expect(fromRepo.bytes.toString('utf8')).toContain('// kits/kit.ts');
  });
});
