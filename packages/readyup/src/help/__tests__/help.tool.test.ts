import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { TOPICS } from '../topics.ts';

const packageDir = path.resolve(import.meta.dirname, '../../..');
const sourceCli = path.join(packageDir, 'src/bin/rdy.ts');
const publishedCli = path.join(packageDir, 'bin/rdy.js');
const buildOutput = path.join(packageDir, 'dist/esm/bin/rdy.js');
const conceptsTopic = TOPICS['concepts'];
assert.ok(conceptsTopic !== undefined, 'TOPICS declares no "concepts" topic');
const conceptsDoc = readFileSync(path.join(packageDir, 'docs', conceptsTopic.file), 'utf8');

/**
 * Drives the real CLI, which is the only tier that shows where a spawned rdy looks for its doc files.
 *
 * A resolver reading the working directory would satisfy every in-process test, since those run with
 * the package as the working directory. Running from a directory that holds no `docs/` tells the two
 * apart.
 */
describe('rdy help, spawned', () => {
  it('prints the same file from inside the package and from an unrelated directory', () => {
    const fromPackage = runHelp(sourceCli, 'concepts', packageDir);
    const fromElsewhere = runHelp(sourceCli, 'concepts', tmpdir());

    expect(fromElsewhere).toBe(fromPackage);
  });

  it('prints a whole doc file', () => {
    const stdout = runHelp(sourceCli, 'concepts', tmpdir());

    expect(stdout.trimEnd()).toBe(conceptsDoc.trimEnd());
  });

  // The published entry runs from `dist/esm/bin/`, two directories deeper than the source entry, so it
  // is the only spawn that shows the package root still resolving to where `docs/` sits. It needs build
  // output, which `nmr ci` produces before it checks and a bare `nmr test` does not.
  it.skipIf(!existsSync(buildOutput))('resolves the doc files from the published entry point', () => {
    const stdout = runHelp(publishedCli, 'concepts', tmpdir());

    expect(stdout.trimEnd()).toBe(conceptsDoc.trimEnd());
  });
});

// region | Helpers

/** Runs `rdy help <topic>` through one entry point and returns what it wrote to stdout. */
function runHelp(entryPath: string, topic: string, cwd: string): string {
  return execFileSync(process.execPath, [entryPath, 'help', topic], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

// endregion | Helpers
