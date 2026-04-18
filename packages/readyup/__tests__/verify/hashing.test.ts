import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { hashBytes, hashFile } from '../../src/verify/hashing.ts';

describe(hashBytes, () => {
  it('returns an 8-character hex string', () => {
    const result = hashBytes(Buffer.from('hello world'));

    expect(result).toMatch(/^[0-9a-f]{8}$/);
  });

  it('returns the same hash for identical bytes', () => {
    const a = hashBytes(Buffer.from('identical'));
    const b = hashBytes(Buffer.from('identical'));

    expect(a).toBe(b);
  });

  it('returns different hashes for different bytes', () => {
    const a = hashBytes(Buffer.from('content A'));
    const b = hashBytes(Buffer.from('content B'));

    expect(a).not.toBe(b);
  });
});

describe(hashFile, () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'hash-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns an 8-character hex string', () => {
    const filePath = path.join(tempDir, 'test.js');
    writeFileSync(filePath, 'export default {};\n', 'utf8');

    const result = hashFile(filePath);

    expect(result).toMatch(/^[0-9a-f]{8}$/);
  });

  it('produces the same hash as hashBytes for the same content', () => {
    const filePath = path.join(tempDir, 'payload.js');
    const content = 'export const answer = 42;\n';
    writeFileSync(filePath, content, 'utf8');

    expect(hashFile(filePath)).toBe(hashBytes(Buffer.from(content)));
  });

  it('throws when the file does not exist', () => {
    expect(() => hashFile(path.join(tempDir, 'missing.js'))).toThrow();
  });
});
