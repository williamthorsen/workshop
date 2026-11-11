import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

const BUILD_ENTRY = 'dist/esm/bin/rdy.js';

const SOURCE_ENTRY = 'src/bin/rdy.ts';

const WRAPPER_ENTRY = 'bin/rdy.js';

const WRAPPER_SOURCE = fs.readFileSync(path.join(import.meta.dirname, '../../../', WRAPPER_ENTRY), 'utf8');

// The wrapper resolves its entry points relative to its own location, so a copy in a temp tree decides for itself
// which of them is there, whether or not this checkout has been built.
describe('rdy wrapper', () => {
  it('reports the absent build when neither entry point is there', () => {
    using tree = createTempTree({ [WRAPPER_ENTRY]: WRAPPER_SOURCE });

    const { status, stderr } = runWrapper(tree);

    expect(status).toBe(1);
    expect(stderr).toMatch(/build output not found/);
    expect(stderr).toMatch(/Reinstall the package/);
  });

  it('runs the build output when the source is absent', () => {
    using tree = createTempTree({ [WRAPPER_ENTRY]: WRAPPER_SOURCE, [BUILD_ENTRY]: buildMarkerEntry('build reached') });

    const { status, stdout } = runWrapper(tree);

    expect(status).toBe(0);
    expect(stdout).toBe('build reached\n');
  });

  it('runs the source when the build output is absent', () => {
    using tree = createTempTree({
      [WRAPPER_ENTRY]: WRAPPER_SOURCE,
      [SOURCE_ENTRY]: buildMarkerEntry('source reached'),
    });

    const { status, stdout } = runWrapper(tree);

    expect(status).toBe(0);
    expect(stdout).toBe('source reached\n');
  });

  it('prefers the source to the build output', () => {
    using tree = createTempTree({
      [WRAPPER_ENTRY]: WRAPPER_SOURCE,
      [BUILD_ENTRY]: buildMarkerEntry('build reached'),
      [SOURCE_ENTRY]: buildMarkerEntry('source reached'),
    });

    const { status, stdout } = runWrapper(tree);

    expect(status).toBe(0);
    expect(stdout).toBe('source reached\n');
  });

  it('reports a load failure when the build is present and one of its imports is not', () => {
    using tree = createTempTree({ [WRAPPER_ENTRY]: WRAPPER_SOURCE, [BUILD_ENTRY]: "import './absent.js';\n" });

    const { status, stderr } = runWrapper(tree);

    expect(status).toBe(1);
    expect(stderr).toMatch(/failed to load/);
    // The absence is the assertion: The gate reads the entry file, whereas the error code that it would otherwise
    // key on fires for any unresolved module in the graph.
    expect(stderr).not.toMatch(/build output not found/);
  });

  it('reports an entry point that throws while loading', () => {
    using tree = createTempTree({ [WRAPPER_ENTRY]: WRAPPER_SOURCE, [SOURCE_ENTRY]: 'throw new Error("boom");\n' });

    const { status, stderr } = runWrapper(tree);

    expect(status).toBe(1);
    expect(stderr).toBe('rdy: failed to load: boom\n');
  });
});

// region | Helpers

/** Runs the wrapper written into a tree, returning its exit status and what it wrote to each stream. */
function runWrapper(tree: TempTree): { status: number | null; stderr: string; stdout: string } {
  const { status, stderr, stdout } = spawnSync(process.execPath, [tree.resolve(WRAPPER_ENTRY)], { encoding: 'utf8' });

  return { status, stderr, stdout };
}

/** Returns the body of a stub entry point that writes a marker line to stdout. */
function buildMarkerEntry(marker: string): string {
  return `process.stdout.write(${JSON.stringify(`${marker}\n`)});\n`;
}

// endregion | Helpers
