import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { makeStubPath } from '../stub-path.ts';

describe(makeStubPath, () => {
  it('writes each stub as an executable sh script in a directory searched ahead of the base path', () => {
    const searchPath = makeStubPath({ wt: 'echo stubbed' }, '/usr/bin:/bin');
    const [bin, ...rest] = searchPath.split(':');
    expect(rest).toStrictEqual(['/usr/bin', '/bin']);

    const stub = path.join(bin ?? '', 'wt');
    expect(fs.readFileSync(stub, 'utf8')).toBe('#!/bin/sh\necho stubbed\n');
    expect(fs.statSync(stub).mode & 0o111).toBe(0o111);
  });

  it('returns the stub directory alone for an empty base path', () => {
    const searchPath = makeStubPath({ wt: 'exit 0' }, '');
    expect(searchPath).not.toContain(':');
    expect(fs.existsSync(path.join(searchPath, 'wt'))).toBe(true);
  });
});
