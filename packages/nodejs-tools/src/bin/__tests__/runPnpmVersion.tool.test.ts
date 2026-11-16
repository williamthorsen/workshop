import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installFakeProgram } from '../../test-utils/installFakeProgram.ts';
import { runPnpmVersion } from '../runPnpmVersion.ts';

describe(runPnpmVersion, () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('takes the last non-empty line of stdout, run in the given directory', () => {
    using tree = createTempTree({ 'repo/.keep': '' });
    // The script prints its working directory last, so the returned version names the directory in which it ran.
    installFakeProgram(tree, 'pnpm', 'echo "switching to the pinned version"\necho\npwd\n');

    expect(runPnpmVersion(tree.resolve('repo'))).toStrictEqual({ version: tree.resolve('repo') });
  });

  it('reports a non-zero exit with the last line of stderr', () => {
    using tree = createTempTree({});
    installFakeProgram(tree, 'pnpm', 'echo "cannot download" >&2\nexit 7\n');

    expect(runPnpmVersion(tree.dir)).toStrictEqual({ failure: 'exit 7: cannot download' });
  });

  it('reports a run that wrote nothing', () => {
    using tree = createTempTree({});
    installFakeProgram(tree, 'pnpm', 'exit 0\n');

    expect(runPnpmVersion(tree.dir)).toStrictEqual({ failure: 'no output' });
  });

  it('reports the spawn error when no pnpm is on PATH', () => {
    using tree = createTempTree({ 'empty/.keep': '' });
    vi.stubEnv('PATH', tree.resolve('empty'));

    expect(runPnpmVersion(tree.dir)).toMatchObject({ failure: expect.stringContaining('ENOENT') });
  });
});
