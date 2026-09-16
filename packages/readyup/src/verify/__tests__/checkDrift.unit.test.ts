import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { computeHash } from '../../check-utils/hashing.ts';
import { checkDrift } from '../checkDrift.ts';
import { hashBytes } from '../targetHash.ts';

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'drift-test-' })),
);

describe(checkDrift, () => {
  it('returns ok when the on-disk hash matches the manifest targetHash', ({ temp }) => {
    const content = Buffer.from('compiled output');
    temp.write('demo.js', content);
    const expectedHash = hashBytes(content);

    const status = checkDrift({ name: 'demo', path: 'demo.js', targetHash: expectedHash }, temp.dir);

    expect(status.kind).toBe('ok');
  });

  it.for([12, 64])('returns ok when the manifest records a %i-character targetHash', (length, { temp }) => {
    const content = Buffer.from('compiled output');
    temp.write('demo.js', content);
    const recorded = computeHash(content).slice(0, length);

    const status = checkDrift({ name: 'demo', path: 'demo.js', targetHash: recorded }, temp.dir);

    expect(status).toStrictEqual({ kind: 'ok', targetHash: recorded });
  });

  it('reports the actual hash at the recorded length when a longer record has drifted', ({ temp }) => {
    temp.write('demo.js', 'on-disk content');
    const recorded = computeHash('other content').slice(0, 64);

    const status = checkDrift({ name: 'demo', path: 'demo.js', targetHash: recorded }, temp.dir);

    expect(status).toMatchObject({ kind: 'drift', expected: recorded, actual: computeHash('on-disk content') });
  });

  it('returns drift when hashes differ', ({ temp }) => {
    temp.write('demo.js', 'on-disk content');

    const status = checkDrift({ name: 'demo', path: 'demo.js', targetHash: 'deadbeef' }, temp.dir);

    expect(status).toMatchObject({
      kind: 'drift',
      expected: 'deadbeef',
      actual: hashBytes(Buffer.from('on-disk content')),
    });
  });

  it('returns missing when the compiled file does not exist', ({ temp }) => {
    const status = checkDrift({ name: 'demo', path: 'demo.js', targetHash: 'deadbeef' }, temp.dir);

    expect(status.kind).toBe('missing');
  });

  it('returns unverified when the kit has no targetHash', ({ temp }) => {
    temp.write('demo.js', 'content');

    const status = checkDrift({ name: 'demo', path: 'demo.js' }, temp.dir);

    expect(status.kind).toBe('unverified');
  });

  it('returns unverified when the kit has no path', ({ temp }) => {
    const status = checkDrift({ name: 'demo', targetHash: 'deadbeef' }, temp.dir);

    expect(status.kind).toBe('unverified');
  });
});
