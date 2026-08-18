import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

const packageDir = path.resolve(import.meta.dirname, '../../..');
const sourceCli = path.join(packageDir, 'src/bin/rdy.ts');
const publishedCli = path.join(packageDir, 'bin/rdy.js');
const buildOutput = path.join(packageDir, 'dist/esm/bin/rdy.js');

/**
 * Drives the real CLI, which is the only tier that shows where a spawned rdy looks for its README.
 *
 * A resolver reading the working directory would satisfy every in-process test, since those run with
 * the package as the working directory. Running from a directory that holds no README is what tells
 * the two apart.
 */
describe('rdy help, spawned', () => {
  it('prints the same section from inside the package and from an unrelated directory', () => {
    const fromPackage = runHelp(sourceCli, 'concepts', packageDir);
    const fromElsewhere = runHelp(sourceCli, 'concepts', tmpdir());

    expect(fromElsewhere).toBe(fromPackage);
  });

  it('prints a whole README section, subsections included', () => {
    const stdout = runHelp(sourceCli, 'concepts', tmpdir());

    expect(stdout.startsWith('## Concepts\n')).toBe(true);
    expect(stdout).toContain('### Thresholds');
    expect(stdout).not.toContain('## Authoring kits');
  });

  // The published entry runs from `dist/esm/bin/`, two directories deeper than the source entry, so it
  // is the only spawn that shows the package root still resolving to where `README.md` sits. It needs
  // build output, which `nmr ci` produces before it checks and a bare `nmr test` does not.
  it.skipIf(!existsSync(buildOutput))('resolves the README from the published entry point', () => {
    const stdout = runHelp(publishedCli, 'concepts', tmpdir());

    expect(stdout.startsWith('## Concepts\n')).toBe(true);
    expect(stdout).toContain('### Thresholds');
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
