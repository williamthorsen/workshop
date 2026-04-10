import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import {
  commandExists,
  fileContains,
  fileDoesNotContain,
  fileExists,
  filesExist,
  readFile,
} from '../../src/check-utils/filesystem.ts';

let tempDir: string;
let cwdSpy: MockInstance;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'rdy-fs-'));
  cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
});

afterEach(() => {
  cwdSpy.mockRestore();
});

describe(fileExists, () => {
  it('returns true when the file exists', () => {
    writeFileSync(join(tempDir, 'found.txt'), 'content');

    expect(fileExists('found.txt')).toBe(true);
  });

  it('returns false when the file does not exist', () => {
    expect(fileExists('missing.txt')).toBe(false);
  });
});

describe(readFile, () => {
  it('returns the file content as a string', () => {
    writeFileSync(join(tempDir, 'hello.txt'), 'hello world');

    expect(readFile('hello.txt')).toBe('hello world');
  });

  it('returns undefined when the file does not exist', () => {
    expect(readFile('missing.txt')).toBeUndefined();
  });
});

describe(fileContains, () => {
  it('returns true when the file matches the pattern', () => {
    writeFileSync(join(tempDir, 'data.txt'), 'version: 3.2.1');

    expect(fileContains('data.txt', /version:\s*\d+/)).toBe(true);
  });

  it('returns false when the file does not match the pattern', () => {
    writeFileSync(join(tempDir, 'data.txt'), 'no match here');

    expect(fileContains('data.txt', /version:/)).toBe(false);
  });

  it('returns false when the file does not exist', () => {
    expect(fileContains('missing.txt', /anything/)).toBe(false);
  });
});

describe(fileDoesNotContain, () => {
  it('returns true when the file does not match the pattern', () => {
    writeFileSync(join(tempDir, 'clean.txt'), 'all good');

    expect(fileDoesNotContain('clean.txt', /bad/)).toBe(true);
  });

  it('returns false when the file matches the pattern', () => {
    writeFileSync(join(tempDir, 'dirty.txt'), 'contains bad stuff');

    expect(fileDoesNotContain('dirty.txt', /bad/)).toBe(false);
  });

  it('returns true when the file does not exist', () => {
    expect(fileDoesNotContain('missing.txt', /anything/)).toBe(true);
  });
});

describe(filesExist, () => {
  it('returns ok with zero counts when paths array is empty', () => {
    const result = filesExist([]);

    expect(result).toEqual({
      ok: true,
      progress: { type: 'fraction', passedCount: 0, count: 0 },
    });
  });

  it('returns ok when all files exist', () => {
    writeFileSync(join(tempDir, 'a.txt'), '');
    writeFileSync(join(tempDir, 'b.txt'), '');

    const result = filesExist(['a.txt', 'b.txt']);

    expect(result).toEqual({
      ok: true,
      progress: { type: 'fraction', passedCount: 2, count: 2 },
    });
  });

  it('returns not ok with missing files listed', () => {
    writeFileSync(join(tempDir, 'a.txt'), '');

    const result = filesExist(['a.txt', 'b.txt', 'c.txt']);

    expect(result).toEqual({
      ok: false,
      detail: 'Missing files: b.txt, c.txt',
      progress: { type: 'fraction', passedCount: 1, count: 3 },
    });
  });

  it('resolves paths relative to baseDir when provided', () => {
    mkdirSync(join(tempDir, 'sub'), { recursive: true });
    writeFileSync(join(tempDir, 'sub', 'found.txt'), '');

    const result = filesExist(['found.txt', 'missing.txt'], { baseDir: 'sub' });

    expect(result).toEqual({
      ok: false,
      detail: 'Missing files: missing.txt',
      progress: { type: 'fraction', passedCount: 1, count: 2 },
    });
  });
});

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
