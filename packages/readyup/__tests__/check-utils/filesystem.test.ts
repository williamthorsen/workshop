import { describe, expect, it } from 'vitest';

import {
  commandExists,
  fileContains,
  fileDoesNotContain,
  fileExists,
  filesExist,
  readFile,
} from '../../src/check-utils/filesystem.ts';
import { useTempDir } from '../helpers/tempDir.ts';

const temp = useTempDir({ prefix: 'rdy-fs-', cwd: 'mock' });

describe(commandExists, () => {
  it('returns true for a command that exists', () => {
    expect(commandExists('node')).toBe(true);
  });

  it('returns false for a command that does not exist', () => {
    expect(commandExists('nonexistent-command-xyz-99')).toBe(false);
  });

  it('returns false for names with shell metacharacters', () => {
    expect(commandExists('node; echo hacked')).toBe(false);
    expect(commandExists('node$(whoami)')).toBe(false);
    expect(commandExists('node|cat')).toBe(false);
  });
});

describe(fileExists, () => {
  it('returns true when the file exists', () => {
    temp.write('found.txt', 'content');

    expect(fileExists('found.txt')).toBe(true);
  });

  it('returns false when the file does not exist', () => {
    expect(fileExists('missing.txt')).toBe(false);
  });
});

describe(fileContains, () => {
  it('returns true when the file matches the pattern', () => {
    temp.write('data.txt', 'version: 3.2.1');

    expect(fileContains('data.txt', /version:\s*\d+/)).toBe(true);
  });

  it('returns false when the file does not match the pattern', () => {
    temp.write('data.txt', 'no match here');

    expect(fileContains('data.txt', /version:/)).toBe(false);
  });

  it('returns false when the file does not exist', () => {
    expect(fileContains('missing.txt', /anything/)).toBe(false);
  });
});

describe(fileDoesNotContain, () => {
  it('returns true when the file does not match the pattern', () => {
    temp.write('clean.txt', 'all good');

    expect(fileDoesNotContain('clean.txt', /bad/)).toBe(true);
  });

  it('returns false when the file matches the pattern', () => {
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

  it('returns ok when all files exist', () => {
    temp.write('a.txt', '');
    temp.write('b.txt', '');

    const result = filesExist(['a.txt', 'b.txt']);

    expect(result).toStrictEqual({
      ok: true,
      progress: { type: 'fraction', passedCount: 2, count: 2 },
    });
  });

  it('returns not ok with missing files listed', () => {
    temp.write('a.txt', '');

    const result = filesExist(['a.txt', 'b.txt', 'c.txt']);

    expect(result).toStrictEqual({
      ok: false,
      detail: 'Missing files: b.txt, c.txt',
      progress: { type: 'fraction', passedCount: 1, count: 3 },
    });
  });

  it('resolves paths relative to baseDir when provided', () => {
    temp.write('sub/found.txt', '');

    const result = filesExist(['found.txt', 'missing.txt'], { baseDir: 'sub' });

    expect(result).toStrictEqual({
      ok: false,
      detail: 'Missing files: missing.txt',
      progress: { type: 'fraction', passedCount: 1, count: 2 },
    });
  });
});

describe(readFile, () => {
  it('returns the file content as a string', () => {
    temp.write('hello.txt', 'hello world');

    expect(readFile('hello.txt')).toBe('hello world');
  });

  it('returns undefined when the file does not exist', () => {
    expect(readFile('missing.txt')).toBeUndefined();
  });
});
