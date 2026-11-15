import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { isDirectory } from '../paths.ts';

describe(isDirectory, () => {
  it('reports a directory, following a symlink, and nothing else', () => {
    using tree = createTempTree({ file: '' }, { prefix: 'thor-chrome-' });
    tree.symlink('link', tree.dir);
    expect(isDirectory(tree.dir)).toBe(true);
    expect(isDirectory(tree.resolve('link'))).toBe(true);
    expect(isDirectory(tree.resolve('file'))).toBe(false);
    expect(isDirectory(tree.resolve('absent'))).toBe(false);
  });
});
