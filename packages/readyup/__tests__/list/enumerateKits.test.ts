import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { enumerateKits } from '../../src/list/enumerateKits.ts';

describe(enumerateKits, () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'enumerateKits-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns base names matching the given extension, sorted alphabetically', () => {
    fs.writeFileSync(path.join(tempDir, 'b.ts'), '');
    fs.writeFileSync(path.join(tempDir, 'a.ts'), '');
    fs.writeFileSync(path.join(tempDir, 'c.js'), '');

    const result = enumerateKits({ dir: tempDir, extension: '.ts' });

    expect(result).toEqual(['a', 'b']);
  });

  it('returns empty array when directory does not exist', () => {
    const result = enumerateKits({ dir: path.join(tempDir, 'nonexistent'), extension: '.ts' });

    expect(result).toEqual([]);
  });

  it('excludes hidden files', () => {
    fs.writeFileSync(path.join(tempDir, '.hidden.ts'), '');
    fs.writeFileSync(path.join(tempDir, 'visible.ts'), '');

    const result = enumerateKits({ dir: tempDir, extension: '.ts' });

    expect(result).toEqual(['visible']);
  });

  it('excludes subdirectories even if their names match the extension', () => {
    fs.mkdirSync(path.join(tempDir, 'subdir.ts'));
    fs.writeFileSync(path.join(tempDir, 'file.ts'), '');

    const result = enumerateKits({ dir: tempDir, extension: '.ts' });

    expect(result).toEqual(['file']);
  });

  it('returns empty array when no files match the extension', () => {
    fs.writeFileSync(path.join(tempDir, 'file.js'), '');

    const result = enumerateKits({ dir: tempDir, extension: '.ts' });

    expect(result).toEqual([]);
  });

  it('strips the extension from results', () => {
    fs.writeFileSync(path.join(tempDir, 'default.js'), '');

    const result = enumerateKits({ dir: tempDir, extension: '.js' });

    expect(result).toEqual(['default']);
  });

  it('rethrows non-ENOENT filesystem errors', () => {
    // Make directory unreadable to trigger EACCES
    fs.mkdirSync(path.join(tempDir, 'restricted'));
    fs.chmodSync(path.join(tempDir, 'restricted'), 0o000);

    expect(() => enumerateKits({ dir: path.join(tempDir, 'restricted'), extension: '.ts' })).toThrow();

    // Restore permissions for cleanup
    fs.chmodSync(path.join(tempDir, 'restricted'), 0o755);
  });
});
