import assert from 'node:assert';

import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { warnOnDirectoryDependentChecks } from '../warnOnDirectoryDependentChecks.ts';

describe(warnOnDirectoryDependentChecks, () => {
  it('reports checklists whose checks differ under its code, naming the kit and the edit that fixes it', () => {
    using _io = captureStdio();

    const [warning] = warnOnDirectoryDependentChecks('publish', { checklists: ['workspaces'] });

    expect(warning).toHaveProperty('code', 'checks-vary-by-directory');
    expect(warning?.message).toContain(
      'kit "publish" records different checks from another directory in checklist "workspaces"',
    );
    expect(warning?.remedy).toContain('assign its `checks` a function that returns them');
    expect(warning?.remedy).toContain('`rdy help authoring`');
  });

  it('names every differing checklist', () => {
    using _io = captureStdio();

    const [warning] = warnOnDirectoryDependentChecks('publish', { checklists: ['a', 'b'] });

    expect(warning?.message).toContain('in checklists "a", "b",');
  });

  it('reports a kit that fails to load from another directory, with the error', () => {
    using _io = captureStdio();

    const [warning] = warnOnDirectoryDependentChecks('publish', { error: 'ENOENT: pnpm-workspace.yaml' });

    expect(warning?.message).toContain(
      'kit "publish" fails to load from another directory (ENOENT: pnpm-workspace.yaml)',
    );
  });

  it('writes the warning to stderr with its remedy', () => {
    using io = captureStdio();

    const [warning] = warnOnDirectoryDependentChecks('publish', { checklists: ['workspaces'] });

    assert.ok(warning);
    expect(io.stderr).toBe(`Warning: ${warning.message} ${warning.remedy}\n`);
  });

  it('reports nothing and writes nothing for a kit whose checks do not depend on the directory', () => {
    using io = captureStdio();

    expect(warnOnDirectoryDependentChecks('publish', undefined)).toStrictEqual([]);
    expect(io.stderr).toBe('');
  });
});
