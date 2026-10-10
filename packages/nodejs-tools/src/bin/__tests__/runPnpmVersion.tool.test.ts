import fs from 'node:fs';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runPnpmVersion } from '../runPnpmVersion.ts';

describe(runPnpmVersion, () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('takes the last non-empty line of stdout, run in the given directory', () => {
    using tree = createTempTree({ 'repo/.keep': '' });
    // The script prints its working directory last, so the returned version names the directory in which it ran.
    installFakePnpm(tree, 'echo "switching to the pinned version"\necho\npwd\n');

    expect(runPnpmVersion(tree.resolve('repo'))).toStrictEqual({ version: tree.resolve('repo') });
  });

  it('reports a non-zero exit with the last line of stderr', () => {
    using tree = createTempTree({});
    installFakePnpm(tree, 'echo "cannot download" >&2\nexit 7\n');

    expect(runPnpmVersion(tree.dir)).toStrictEqual({ failure: 'exit 7: cannot download' });
  });

  it('reports a run that wrote nothing', () => {
    using tree = createTempTree({});
    installFakePnpm(tree, 'exit 0\n');

    expect(runPnpmVersion(tree.dir)).toStrictEqual({ failure: 'no output' });
  });

  it('reports the spawn error when no pnpm is on PATH', () => {
    using tree = createTempTree({ 'empty/.keep': '' });
    vi.stubEnv('PATH', tree.resolve('empty'));

    expect(runPnpmVersion(tree.dir)).toMatchObject({ failure: expect.stringContaining('ENOENT') });
  });
});

// region | Helpers

/** Writes an executable `pnpm` script with the given body into the tree and puts its directory alone on PATH. */
function installFakePnpm(tree: TempTree, body: string): void {
  const scriptPath = tree.write('bin/pnpm', `#!/bin/sh\n${body}`);
  fs.chmodSync(scriptPath, 0o755);
  vi.stubEnv('PATH', tree.resolve('bin'));
}

// endregion | Helpers
