import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

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

const it = baseIt.extend(
  'temp',
  makeFixture(() =>
    createTempTree({ 'kits/default.ts': KIT_SOURCE, 'lib/meta.ts': HELPER_SOURCE }, { prefix: 'load-kit-pick-json-' }),
  ),
);

describe('loadRdyKit with a kit source that calls pickJson', () => {
  it('inlines the picked fields in the kit and in a module that it imports', async ({ temp }) => {
    writePackageJson(temp.dir, { name: 'my-app', engines: { node: '>=24' }, version: '1.0.0' });

    const { kit } = await loadRdyKit(temp.resolve('kits/default.ts'));

    expect(kit.checklists.map(({ name }) => name)).toStrictEqual(['my-app', '>=24']);
  });

  it('reads the JSON file again on a later load', async ({ temp }) => {
    writePackageJson(temp.dir, { name: 'my-app', engines: { node: '>=24' } });
    await loadRdyKit(temp.resolve('kits/default.ts'));
    writePackageJson(temp.dir, { name: 'renamed-app', engines: { node: '>=26' } });

    const { kit } = await loadRdyKit(temp.resolve('kits/default.ts'));

    expect(kit.checklists.map(({ name }) => name)).toStrictEqual(['renamed-app', '>=26']);
  });

  it('fails with the compile message when a picked path is missing', async ({ temp }) => {
    writePackageJson(temp.dir, { name: 'my-app' });

    await expect(loadRdyKit(temp.resolve('kits/default.ts'))).rejects.toThrow('Path not found in JSON: engines.node');
  });
});

// region | Helpers

/** Writes `package.json` at the root of the fixture directory. */
function writePackageJson(dir: string, contents: Record<string, unknown>): void {
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify(contents));
}

// endregion | Helpers
