import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { hashBytes, hashFile } from '../targetHash.ts';

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'hash-test-' })),
);

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
  it('returns an 8-character hex string', ({ temp }) => {
    const filePath = temp.write('test.js', 'export default {};\n');

    const result = hashFile(filePath);

    expect(result).toMatch(/^[0-9a-f]{8}$/);
  });

  it('produces the same hash as hashBytes for the same content', ({ temp }) => {
    const content = 'export const answer = 42;\n';
    const filePath = temp.write('payload.js', content);

    expect(hashFile(filePath)).toBe(hashBytes(Buffer.from(content)));
  });

  it('throws when the file does not exist', ({ temp }) => {
    expect(() => hashFile(temp.resolve('missing.js'))).toThrow(expect.objectContaining({ code: 'ENOENT' }));
  });
});
