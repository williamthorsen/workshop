import { createHash } from 'node:crypto';

import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { computeHash, fileMatchesHash, hashToRecordedLength, isRecordedHash } from '../hashing.ts';

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'rdy-hash-' })),
);

it.aroundEach(async (runTest, { temp }) => {
  using _cwd = pointCwdAt(temp.dir);

  await runTest();
});

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

describe(hashToRecordedLength, () => {
  it('returns the digest truncated to the length the record uses', () => {
    const digest = createHash('sha256').update('bundle').digest('hex');

    expect(hashToRecordedLength('bundle', 'a'.repeat(12))).toBe(digest.slice(0, 12));
  });

  it('returns the whole digest when the recorded value is a full digest', () => {
    const digest = createHash('sha256').update('bundle').digest('hex');

    expect(hashToRecordedLength('bundle', digest)).toBe(digest);
  });

  it('returns the eight characters the compile records when the recorded value is that long', () => {
    const digest = createHash('sha256').update('bundle').digest('hex');

    expect(hashToRecordedLength('bundle', digest.slice(0, 8))).toBe(digest.slice(0, 8));
  });

  it('hashes bytes and the string they encode to the same value', () => {
    const recorded = 'a'.repeat(12);

    expect(hashToRecordedLength(Buffer.from('bundle', 'utf8'), recorded)).toBe(
      hashToRecordedLength('bundle', recorded),
    );
  });
});

describe(isRecordedHash, () => {
  it.each([8, 12, 40, 64])('accepts a %i-character lowercase hex value', (length) => {
    expect(isRecordedHash('a1b2c3d4'.repeat(8).slice(0, length))).toBe(true);
  });

  it.each([
    ['', 'empty'],
    ['a1b2c3d', 'one character below the floor'],
    ['a'.repeat(65), 'one character above a full digest'],
    ['A1B2C3D4', 'uppercase'],
    ['a1b2c3g4', 'a non-hex character'],
    ['a1b2 c3d4', 'whitespace'],
  ])('rejects %o, which is %s', (value) => {
    expect(isRecordedHash(value)).toBe(false);
  });
});
