import { readdirSync, readFileSync } from 'node:fs';

import { captureStdio, createTempTree, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { compileCommand } from '../compileCommand.ts';

const KITS_DIR = '.readyup/kits';
const BUNDLE_PATH = `${KITS_DIR}/demo.js`;
const MANIFEST_PATH = '.readyup/manifest.json';
const SOURCE_PATH = `${KITS_DIR}/demo.ts`;

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  makeFixture(() =>
    createTempTree(
      {
        [SOURCE_PATH]: 'export default { checklists: [] };\n',
        // Anchors the compile on the fixture's own root rather than on an ancestor of the OS temporary directory.
        'package.json': JSON.stringify({ name: 'fixture', version: '1.0.0' }),
      },
      { prefix: 'compile-failed-recompile-' },
    ),
  ),
);

it.aroundEach(async (runTest, { temp }) => {
  using _cwd = pointCwdAt(temp.dir, { chdir: true });

  await runTest();
});

/** Exercises a recompile that fails validation against real esbuild and a real import of the bundle. */
describe('compileCommand after a kit that compiled once fails validation', () => {
  it.for<[string, string[]]>([
    ['a sweep', []],
    ['a single-file compile', [SOURCE_PATH]],
  ])('keeps the previous bundle and manifest entry in %s', async ([_label, positionals], { temp }) => {
    await expect(runCompile(positionals)).resolves.toBe(0);
    const previousBundle = readFileSync(BUNDLE_PATH, 'utf8');
    const previousManifest = readFileSync(MANIFEST_PATH, 'utf8');

    temp.write(SOURCE_PATH, 'export default { notAKit: true };\n');
    const exitCode = await runCompile(positionals);

    expect(exitCode).toBe(1);
    expect(readFileSync(BUNDLE_PATH, 'utf8')).toBe(previousBundle);
    expect(readFileSync(MANIFEST_PATH, 'utf8')).toBe(previousManifest);
    expect(readdirSync(KITS_DIR).toSorted()).toStrictEqual(['demo.js', 'demo.ts']);
  });
});

// region | Helpers

/** Runs `rdy compile --json` with the given positionals, discarding its output, and returns the exit code. */
async function runCompile(positionals: string[]): Promise<number> {
  using _io = captureStdio();

  return await compileCommand([...positionals, '--json']);
}

// endregion | Helpers
