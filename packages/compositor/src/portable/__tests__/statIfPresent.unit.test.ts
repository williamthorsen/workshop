import { chmod, symlink } from 'node:fs/promises';
import path from 'node:path';

import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { describe, expect, it } from 'vitest';

import { statIfPresent } from '../statIfPresent.ts';

describe(statIfPresent, () => {
  it('stats a file that is there', async () => {
    using tree = createTempTree({ 'notes.md': 'notes' });

    expect((await statIfPresent(path.join(tree.dir, 'notes.md')))?.isFile()).toBe(true);
  });

  it('stats a directory that is there', async () => {
    using tree = createTempTree({ 'nested/inner.md': 'inner' });

    expect((await statIfPresent(path.join(tree.dir, 'nested')))?.isDirectory()).toBe(true);
  });

  it('reports undefined for an absent path', async () => {
    using tree = createTempTree({});

    await expect(statIfPresent(path.join(tree.dir, 'never-created'))).resolves.toBeUndefined();
  });

  it('reports undefined for a path below a regular file, which fails as ENOTDIR rather than ENOENT', async () => {
    using tree = createTempTree({ 'notes.md': 'notes' });

    await expect(statIfPresent(path.join(tree.dir, 'notes.md', 'below'))).resolves.toBeUndefined();
  });

  it('follows a symlink to the directory it points at, which a linked install layout produces', async () => {
    using tree = createTempTree({ 'elsewhere/shared/SKILL.md': 'shared' });
    await symlink(path.join(tree.dir, 'elsewhere/shared'), path.join(tree.dir, 'linked'));

    expect((await statIfPresent(path.join(tree.dir, 'linked')))?.isDirectory()).toBe(true);
  });

  it('reports undefined for a symlink whose target is gone, rather than the link itself', async () => {
    using tree = createTempTree({});
    await symlink(path.join(tree.dir, 'never-created'), path.join(tree.dir, 'dangling'));

    await expect(statIfPresent(path.join(tree.dir, 'dangling'))).resolves.toBeUndefined();
  });

  it('fails rather than reporting an absence when the path cannot be reached', async () => {
    using tree = createTempTree({ 'locked/inner.md': 'inner' });
    const lockedDir = path.join(tree.dir, 'locked');
    await chmod(lockedDir, 0o000);

    try {
      // Statting below an unsearchable directory fails with EACCES.
      await expect(statIfPresent(path.join(lockedDir, 'inner.md'))).rejects.toThrow(/EACCES/);
    } finally {
      // Restored before the fixture is removed, since the cleanup cannot descend into an unreadable directory.
      await chmod(lockedDir, 0o755);
    }
  });
});
