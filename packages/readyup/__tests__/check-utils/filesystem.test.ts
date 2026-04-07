import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { fileContains, fileDoesNotContain, fileExists, readFile } from '../../src/check-utils/filesystem.ts';

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
