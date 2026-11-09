import { describe, expect, it } from 'vitest';

import { listDirectoryDependenceWarnings } from '../listDirectoryDependenceWarnings.ts';

describe(listDirectoryDependenceWarnings, () => {
  it('reports checklists whose checks differ under its code, naming the kit and the edit that fixes it', () => {
    const [warning] = listDirectoryDependenceWarnings('publish', { checklists: ['workspaces'] });

    expect(warning).toHaveProperty('code', 'checks-vary-by-directory');
    expect(warning?.message).toContain(
      'kit "publish" records different checks from another directory in checklist "workspaces"',
    );
    expect(warning?.remedy).toContain('assign its `checks` a function that returns them');
    expect(warning?.remedy).toContain('`rdy help authoring`');
  });

  it('names every differing checklist', () => {
    const [warning] = listDirectoryDependenceWarnings('publish', { checklists: ['a', 'b'] });

    expect(warning?.message).toContain('in checklists "a", "b",');
  });

  it('reports a kit that fails to load from another directory, with the error', () => {
    const [warning] = listDirectoryDependenceWarnings('publish', { error: 'ENOENT: pnpm-workspace.yaml' });

    expect(warning?.message).toContain(
      'kit "publish" fails to load from another directory (ENOENT: pnpm-workspace.yaml)',
    );
  });

  it('reports nothing for a kit whose checks do not depend on the directory', () => {
    expect(listDirectoryDependenceWarnings('publish', undefined)).toStrictEqual([]);
  });
});
