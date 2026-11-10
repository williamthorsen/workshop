import { captureStdio, createTempTree, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import type { ReportedWarning } from '../../output/writeWarnings.ts';
import { createUncachedRemoteContext } from '../../test-utils/createUncachedRemoteContext.ts';
import { runRecursiveMode, runRecursiveSourcesMode } from '../list-recursive.ts';

const it = baseIt.extend(
  'temp',
  makeFixture(() =>
    createTempTree(
      {
        'package.json': JSON.stringify({ name: 'root' }),

        // One compiled kit, recorded by its manifest.
        'packages/good/package.json': JSON.stringify({ name: 'good' }),
        'packages/good/.readyup/kits/default.js': 'export default {};',
        'packages/good/.readyup/manifest.json': JSON.stringify({
          version: 1,
          kits: [{ name: 'default', path: 'kits/default.js' }],
        }),

        // Compiled kits beside a manifest that cannot be parsed.
        'packages/corrupt/package.json': JSON.stringify({ name: 'corrupt' }),
        'packages/corrupt/.readyup/kits/audit.js': 'export default {};',
        'packages/corrupt/.readyup/manifest.json': '{ "version": 1, "kits": [',

        // A config that cannot be evaluated, with nothing under the default directories.
        'packages/misconfigured/package.json': JSON.stringify({ name: 'misconfigured' }),
        'packages/misconfigured/.config/readyup.config.ts': 'export default { this is not TypeScript',
      },
      { prefix: 'rdy-list-recursive-' },
    ),
  ),
);

describe(runRecursiveMode, () => {
  it.aroundEach(async (runTest, { temp }) => {
    using _cwd = pointCwdAt(temp.dir);

    await runTest();
  });

  it('returns the view and the rows, with the warnings in the order raised, and writes nothing', async () => {
    using io = captureStdio();
    const warnings: ReportedWarning[] = [];

    const result = await runRecursiveMode(false, warnings);

    expect(result.view).toContain('packages/good/');
    expect(result.kits.map(({ name, project }) => `${project}:${name}`)).toStrictEqual(
      expect.arrayContaining(['packages/good:default', 'packages/corrupt:audit']),
    );
    expect(warnings).toStrictEqual([
      { message: expect.stringMatching(/Reading packages\/misconfigured with default settings\.$/) },
      { message: expect.stringContaining('corrupt') },
    ]);
    expect(io.stdout).toBe('');
    expect(io.stderr).toBe('');
  });
});

describe(runRecursiveSourcesMode, () => {
  it.aroundEach(async (runTest, { temp }) => {
    using _cwd = pointCwdAt(temp.dir);

    await runTest();
  });

  it('returns the view, with a warning for each project read under default settings, and writes nothing', async () => {
    using io = captureStdio();
    const warnings: ReportedWarning[] = [];

    const result = await runRecursiveSourcesMode(false, createUncachedRemoteContext(), warnings);

    expect(result.view).not.toBe('');
    expect(result.kits).toStrictEqual([]);
    expect(warnings).toStrictEqual([
      { message: expect.stringMatching(/Reading packages\/misconfigured with default settings\.$/) },
    ]);
    expect(io.stdout).toBe('');
    expect(io.stderr).toBe('');
  });
});
