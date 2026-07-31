import { createHash } from 'node:crypto';

import { describe, expect } from 'vitest';

import { computeHash, fileMatchesHash } from '../../src/check-utils/hashing.ts';
import { createTempDirTest } from '../helpers/tempDir.ts';

const it = createTempDirTest({ prefix: 'rdy-hash-', cwd: 'mock' });

describe(computeHash, () => {
  it('returns a SHA-256 hex digest of the given string', () => {
    const content = 'hello world';
    const expected = createHash('sha256').update(content).digest('hex');

    expect(computeHash(content)).toBe(expected);
  });

  it('returns a different hash for different content', () => {
    expect(computeHash('abc')).not.toBe(computeHash('def'));
  });

  it('returns a deterministic hash for the same content', () => {
    expect(computeHash('same')).toBe(computeHash('same'));
  });
});

describe(fileMatchesHash, () => {
  it('returns true when the file content matches the expected hash', ({ temp }) => {
    const content = 'exact content';
    temp.write('config.js', content);
    const hash = createHash('sha256').update(content).digest('hex');

    expect(fileMatchesHash('config.js', hash)).toBe(true);
  });

  it('returns false when the file content does not match the expected hash', ({ temp }) => {
    temp.write('config.js', 'actual content');

    expect(fileMatchesHash('config.js', 'wrong-hash')).toBe(false);
  });

  it('returns false when the file does not exist', () => {
    expect(fileMatchesHash('missing.js', 'any-hash')).toBe(false);
  });
});
