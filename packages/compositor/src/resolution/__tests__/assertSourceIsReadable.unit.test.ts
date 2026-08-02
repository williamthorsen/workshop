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
});
