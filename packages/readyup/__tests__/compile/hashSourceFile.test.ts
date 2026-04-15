import { writeFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { hashSourceFile } from '../../src/compile/hashSourceFile.ts';

describe(hashSourceFile, () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'hash-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns an 8-character hex string', () => {
    const filePath = path.join(tempDir, 'test.ts');
    writeFileSync(filePath, 'export default {};\n', 'utf8');

    const result = hashSourceFile(filePath);

    expect(result).toMatch(/^[0-9a-f]{8}$/);
  });

  it('returns the same hash for identical content', () => {
    const file1 = path.join(tempDir, 'a.ts');
    const file2 = path.join(tempDir, 'b.ts');
    writeFileSync(file1, 'hello world', 'utf8');
    writeFileSync(file2, 'hello world', 'utf8');

    expect(hashSourceFile(file1)).toBe(hashSourceFile(file2));
  });

  it('returns different hashes for different content', () => {
    const file1 = path.join(tempDir, 'a.ts');
    const file2 = path.join(tempDir, 'b.ts');
    writeFileSync(file1, 'content A', 'utf8');
    writeFileSync(file2, 'content B', 'utf8');

    expect(hashSourceFile(file1)).not.toBe(hashSourceFile(file2));
  });

  it('throws when the file does not exist', () => {
    expect(() => hashSourceFile(path.join(tempDir, 'missing.ts'))).toThrow();
  });
});
