import { chmod } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { assertSourceIsReadable } from '../assertSourceIsReadable.ts';
import { buildSource } from '../test-utils/buildSource.ts';

describe(assertSourceIsReadable, () => {
  it('accepts a source pointing at a directory', async () => {
    const source = await buildSource({ 'skills/lint/SKILL.md': 'lint' });

    await expect(assertSourceIsReadable(source)).resolves.toBeUndefined();
  });

  it('rejects a source pointing at nothing', async () => {
    const source = await buildSource({});

    await expect(assertSourceIsReadable({ ...source, dir: path.join(source.dir, 'absent') })).rejects.toThrow(
      /does not exist/,
    );
  });

  it('rejects a source pointing at a file', async () => {
    const source = await buildSource({ 'guidance.md': 'not a directory' });

    await expect(assertSourceIsReadable({ ...source, dir: path.join(source.dir, 'guidance.md') })).rejects.toThrow(
      /not a directory/,
    );
  });

  it('surfaces a permission failure rather than reporting the source as absent', async () => {
    const source = await buildSource({ 'guidance/rulebooks/naming.md': 'naming' });
    const unreachable = path.join(source.dir, 'guidance');
    await chmod(source.dir, 0o000);

    try {
      // A source behind an unreadable parent must not read as one that does not exist: the declaration is fine, and
      // reporting it as missing would send the reader looking for a typo.
      await expect(assertSourceIsReadable({ ...source, dir: unreachable })).rejects.toThrow(/EACCES/);
    } finally {
      // Restored before the fixture is removed, since the cleanup cannot descend into an unreadable directory.
      await chmod(source.dir, 0o755);
    }
  });
});
