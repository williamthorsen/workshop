import { join } from 'node:path';

import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, test } from 'vitest';

import { fileContains, fileDoesNotContain, fileExists, filesExist, readFile } from '../filesystem.ts';

const it = test.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'rdy-fs-' })),
);

it.aroundEach(async (runTest, { temp }) => {
  using _cwd = pointCwdAt(temp.dir);

  await runTest();
});

describe(fileExists, () => {
  it('returns true when the file exists', ({ temp }) => {
    temp.write('found.txt', 'content');

    expect(fileExists('found.txt')).toBe(true);
  });

  it('returns false when the file does not exist', () => {
    expect(fileExists('missing.txt')).toBe(false);
  });

  it('reads an absolute path as itself', ({ temp }) => {
    temp.write('found.txt', 'content');

    expect(fileExists(join(temp.dir, 'found.txt'))).toBe(true);
  });
});

describe(fileContains, () => {
  it('returns true when the file matches the pattern', ({ temp }) => {
    temp.write('data.txt', 'version: 3.2.1');

    expect(fileContains('data.txt', /version:\s*\d+/)).toBe(true);
  });

  it('returns false when the file does not match the pattern', ({ temp }) => {
    temp.write('data.txt', 'no match here');

    expect(fileContains('data.txt', /version:/)).toBe(false);
  });

  it('returns false when the file does not exist', () => {
    expect(fileContains('missing.txt', /anything/)).toBe(false);
  });
});

describe(fileDoesNotContain, () => {
  it('returns true when the file does not match the pattern', ({ temp }) => {
    temp.write('clean.txt', 'all good');

    expect(fileDoesNotContain('clean.txt', /bad/)).toBe(true);
  });

  it('returns false when the file matches the pattern', ({ temp }) => {
    temp.write('dirty.txt', 'contains bad stuff');

    expect(fileDoesNotContain('dirty.txt', /bad/)).toBe(false);
  });

  it('returns true when the file does not exist', () => {
    expect(fileDoesNotContain('missing.txt', /anything/)).toBe(true);
  });
});

describe(filesExist, () => {
  it('returns ok with zero counts when paths array is empty', () => {
    const result = filesExist([]);

    expect(result).toStrictEqual({
      ok: true,
      progress: { type: 'fraction', passedCount: 0, count: 0 },
    });
  });

  it('returns ok when all files exist', ({ temp }) => {
    temp.write('a.txt', '');
    temp.write('b.txt', '');

    const result = filesExist(['a.txt', 'b.txt']);

    expect(result).toStrictEqual({
      ok: true,
      progress: { type: 'fraction', passedCount: 2, count: 2 },
    });
  });

  it('returns not ok with missing files listed', ({ temp }) => {
    temp.write('a.txt', '');

    const result = filesExist(['a.txt', 'b.txt', 'c.txt']);

    expect(result).toStrictEqual({
      ok: false,
      detail: 'missing files: b.txt, c.txt',
      progress: { type: 'fraction', passedCount: 1, count: 3 },
    });
  });

  it('resolves paths relative to baseDir when provided', ({ temp }) => {
    temp.write('sub/found.txt', '');

    const result = filesExist(['found.txt', 'missing.txt'], { baseDir: 'sub' });

    expect(result).toStrictEqual({
      ok: false,
      detail: 'missing files: missing.txt',
      progress: { type: 'fraction', passedCount: 1, count: 2 },
    });
  });

  it('reads an absolute path as itself', ({ temp }) => {
    temp.write('found.txt', '');

    const result = filesExist([join(temp.dir, 'found.txt')]);

    expect(result).toStrictEqual({
      ok: true,
      progress: { type: 'fraction', passedCount: 1, count: 1 },
    });
  });

  it('reads an absolute path as itself in preference to baseDir', ({ temp }) => {
    temp.write('outside-base.txt', '');

    const result = filesExist([join(temp.dir, 'outside-base.txt')], { baseDir: 'sub' });

    expect(result.ok).toBe(true);
  });
});

describe(readFile, () => {
  it('returns the file content as a string', ({ temp }) => {
    temp.write('hello.txt', 'hello world');

    expect(readFile('hello.txt')).toBe('hello world');
  });

  it('returns undefined when the file does not exist', () => {
    expect(readFile('missing.txt')).toBeUndefined();
  });

  it('reads an absolute path as itself', ({ temp }) => {
    temp.write('hello.txt', 'hello world');

    expect(readFile(join(temp.dir, 'hello.txt'))).toBe('hello world');
  });
});
