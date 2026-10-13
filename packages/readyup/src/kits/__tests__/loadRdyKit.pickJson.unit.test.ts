import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadRdyKit } from '../loadRdyKit.ts';

// The fixtures call `pickJson` without importing it: Nothing type-checks a kit loaded through jiti, and `readyup`
// does not resolve from a tmpdir.
const HELPER_SOURCE = `export const meta = pickJson('../package.json', ['name']);\n`;
const KIT_SOURCE = [
  `import { meta } from '../lib/meta.ts';`,
  `const pkg = pickJson('../package.json', [['engines', 'node']]);`,
  `const check = { name: 'present', check: () => true };`,
  `export const checklists = [meta.name, pkg.engines.node].map((name) => ({ name, checks: [check] }));`,
].join('\n');

describe('loadRdyKit with a kit source that calls pickJson', () => {
  let dir: string;
  let kitPath: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'load-kit-pick-json-'));
    mkdirSync(path.join(dir, 'kits'));
    mkdirSync(path.join(dir, 'lib'));
    writeFileSync(path.join(dir, 'lib', 'meta.ts'), HELPER_SOURCE);
    kitPath = path.join(dir, 'kits', 'default.ts');
    writeFileSync(kitPath, KIT_SOURCE);
  });

  afterEach(() => {
    rmSync(dir, { force: true, recursive: true });
  });

  it('inlines the picked fields in the kit and in a module that it imports', async () => {
    writePackageJson(dir, { name: 'my-app', engines: { node: '>=24' }, version: '1.0.0' });

    const { kit } = await loadRdyKit(kitPath);

    expect(kit.checklists.map(({ name }) => name)).toStrictEqual(['my-app', '>=24']);
  });

  it('reads the JSON file again on a later load', async () => {
    writePackageJson(dir, { name: 'my-app', engines: { node: '>=24' } });
    await loadRdyKit(kitPath);
    writePackageJson(dir, { name: 'renamed-app', engines: { node: '>=26' } });

    const { kit } = await loadRdyKit(kitPath);

    expect(kit.checklists.map(({ name }) => name)).toStrictEqual(['renamed-app', '>=26']);
  });

  it('fails with the compile message when a picked path is missing', async () => {
    writePackageJson(dir, { name: 'my-app' });

    await expect(loadRdyKit(kitPath)).rejects.toThrow('Path not found in JSON: engines.node');
  });
});

// region | Helpers

/** Writes `package.json` at the root of the fixture directory. */
function writePackageJson(dir: string, contents: Record<string, unknown>): void {
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify(contents));
}

// endregion | Helpers
