import { spawnSync } from 'node:child_process';
import { cpSync } from 'node:fs';
import path from 'node:path';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

const RDY_BIN_PATH = path.resolve(import.meta.dirname, '..', '..', 'bin', 'rdy.ts');

/** Matches the Node warnings that a bundle evaluated outside an ES-module scope produces. */
const MODULE_TYPE_WARNING_PATTERN = /MODULE_TYPELESS_PACKAGE_JSON|Failed to load the ES module/;

/** A kit that binds readyup, which resolves at run time only when the bundle loads as an ES module. */
const KIT_SOURCE = `import { defineRdyKit } from 'readyup';

export default defineRdyKit({
  checklists: [{ name: 'basics', checks: [{ name: 'passes', check: () => true }] }],
});
`;

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'readyup-module-scope-' })),
);

describe('compiling and running kits in a project that is not an ES-module package', () => {
  it.for([
    { label: 'declares "type": "commonjs"', manifest: { name: 'project', type: 'commonjs' } },
    { label: 'declares no type', manifest: { name: 'project' } },
  ])('compiles and runs a kit in a project that $label', ({ manifest }, { temp }) => {
    writeProject(temp, 'project', manifest);
    const projectDir = temp.resolve('project');
    const originalManifest = temp.read('project/package.json');

    const compiled = runRdy(projectDir, ['compile']);

    expect(compiled.status, compiled.stderr).toBe(0);
    expect(compiled.stderr).not.toMatch(MODULE_TYPE_WARNING_PATTERN);
    expect(temp.read('project/package.json')).toBe(originalManifest);
    expect(temp.listFiles('project/.readyup').toSorted()).toStrictEqual([
      'kits/default.js',
      'kits/default.ts',
      'manifest.json',
    ]);

    const ran = runRdy(projectDir, ['run']);

    expect(ran.status, ran.stderr).toBe(0);
    expect(ran.stderr).not.toMatch(MODULE_TYPE_WARNING_PATTERN);
  });

  it('runs the kits of a commonjs publisher through --from', ({ temp }) => {
    writeCompiledPublisher(temp);
    temp.writeJson('consumer/package.json', { name: 'consumer', type: 'commonjs' });

    const ran = runRdy(temp.resolve('consumer'), ['run', '--from', temp.resolve('publisher')]);

    expect(ran.status, ran.stderr).toBe(0);
  });

  it('runs the kits of an installed commonjs publisher through --sources', ({ temp }) => {
    writeCompiledPublisher(temp);
    temp.writeJson('consumer/package.json', { name: 'consumer', type: 'commonjs' });
    temp.write('consumer/.config/readyup.config.ts', "export default { sources: ['npm:publisher'] };\n");
    cpSync(temp.resolve('publisher'), temp.resolve('consumer/node_modules/publisher'), { recursive: true });

    const ran = runRdy(temp.resolve('consumer'), ['run', '--sources']);

    expect(ran.status, ran.stderr).toBe(0);
  });
});

// region | Helpers

/** Runs the rdy bin from source in `cwd`, returning its exit status and output. */
function runRdy(cwd: string, args: string[]): { status: number | null; stderr: string; stdout: string } {
  const { status, stderr, stdout } = spawnSync(process.execPath, [RDY_BIN_PATH, ...args], { cwd, encoding: 'utf8' });
  return { status, stderr, stdout };
}

/** Writes a commonjs publisher whose default kit is compiled, as a package that publishes `.readyup`. */
function writeCompiledPublisher(temp: TempTree): void {
  writeProject(temp, 'publisher', { name: 'publisher', type: 'commonjs', files: ['.readyup'] });
  const compiled = runRdy(temp.resolve('publisher'), ['compile']);
  expect(compiled.status, compiled.stderr).toBe(0);
}

/** Writes a project containing a default kit source below `dir`, with the given `package.json`. */
function writeProject(temp: TempTree, dir: string, manifest: Record<string, unknown>): void {
  temp.writeJson(`${dir}/package.json`, manifest);
  temp.write(`${dir}/.readyup/kits/default.ts`, KIT_SOURCE);
}

// endregion | Helpers
