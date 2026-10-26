import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { makeFixtureDir } from '../../test-utils/fixture-dir.ts';
import { isDirectory } from '../paths.ts';

describe(isDirectory, () => {
  it('reports a directory, following a symlink, and nothing else', () => {
    const dir = makeFixtureDir();
    fs.writeFileSync(path.join(dir, 'file'), '');
    fs.symlinkSync(dir, path.join(dir, 'link'));
    expect(isDirectory(dir)).toBe(true);
    expect(isDirectory(path.join(dir, 'link'))).toBe(true);
    expect(isDirectory(path.join(dir, 'file'))).toBe(false);
    expect(isDirectory(path.join(dir, 'absent'))).toBe(false);
  });
});
