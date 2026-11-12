import { chmod } from 'node:fs/promises';
import path from 'node:path';

import { captureError } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { DeclarationError } from '../../declaration/DeclarationError.ts';
import { assertSourceIsReadable } from '../assertSourceIsReadable.ts';
import { buildSource } from '../test-utils/buildSource.ts';

describe(assertSourceIsReadable, () => {
  it('accepts a source pointing at a directory', async () => {
    const source = buildSource({ 'skills/lint/SKILL.md': 'lint' });

    await expect(assertSourceIsReadable(source)).resolves.toBeUndefined();
  });

  it('rejects a source pointing at nothing', async () => {
    const source = buildSource({});

    const error = await captureError(DeclarationError, () =>
      assertSourceIsReadable({ ...source, dir: path.join(source.dir, 'absent') }),
    );

    expect(error.message).toMatch(/does not exist/);
    expect(error.cause).toHaveProperty('code', 'ENOENT');
  });

  it('rejects a source pointing at a file', async () => {
    const source = buildSource({ 'guidance.md': 'not a directory' });

    await expect(assertSourceIsReadable({ ...source, dir: path.join(source.dir, 'guidance.md') })).rejects.toThrow(
      /not a directory/,
    );
    await expect(assertSourceIsReadable({ ...source, dir: path.join(source.dir, 'guidance.md') })).rejects.toThrow(
      DeclarationError,
    );
  });

  it('surfaces a permission failure rather than reporting the source as absent', async () => {
    const source = buildSource({ 'guidance/rulebooks/naming.md': 'naming' });
    const unreachable = path.join(source.dir, 'guidance');
    await chmod(source.dir, 0o000);

    try {
      await expect(assertSourceIsReadable({ ...source, dir: unreachable })).rejects.toThrow(/EACCES/);
    } finally {
      // Restored before the fixture is removed, since the cleanup cannot descend into an unreadable directory.
      await chmod(source.dir, 0o755);
    }
  });
});
