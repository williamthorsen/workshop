import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { computeHash } from '../../check-utils/hashing.ts';
import { checkSourceDrift } from '../checkSourceDrift.ts';
import { hashBytes } from '../targetHash.ts';

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'source-drift-test-' })),
);

describe(checkSourceDrift, () => {
  it('returns ok when the on-disk hash matches the manifest sourceHash', ({ temp }) => {
    const content = Buffer.from('export default { checklists: [] };');
    temp.write('demo.ts', content);

    const status = checkSourceDrift({ name: 'demo', source: 'demo.ts', sourceHash: hashBytes(content) }, temp.dir);

    expect(status.kind).toBe('ok');
  });

  it.for([12, 64])('returns ok when the manifest records a %i-character sourceHash', (length, { temp }) => {
    const content = Buffer.from('export default { checklists: [] };');
    temp.write('demo.ts', content);
    const recorded = computeHash(content).slice(0, length);

    const status = checkSourceDrift({ name: 'demo', source: 'demo.ts', sourceHash: recorded }, temp.dir);

    expect(status).toStrictEqual({ kind: 'ok', sourceHash: recorded });
  });

  it('reports the actual hash at the recorded length when a longer record has gone stale', ({ temp }) => {
    temp.write('demo.ts', 'export default { checklists: [1] };');
    const recorded = computeHash('export default { checklists: [] };').slice(0, 64);

    const status = checkSourceDrift({ name: 'demo', source: 'demo.ts', sourceHash: recorded }, temp.dir);

    expect(status).toMatchObject({
      kind: 'stale',
      expected: recorded,
      actual: computeHash('export default { checklists: [1] };'),
    });
  });

  it('returns stale with both hashes when the source has changed since compile', ({ temp }) => {
    temp.write('demo.ts', 'export default { checklists: [1] };');

    const status = checkSourceDrift({ name: 'demo', source: 'demo.ts', sourceHash: 'deadbeef' }, temp.dir);

    expect(status).toMatchObject({
      kind: 'stale',
      expected: 'deadbeef',
      actual: hashBytes(Buffer.from('export default { checklists: [1] };')),
    });
  });

  it('returns missing when the recorded source file is gone', ({ temp }) => {
    const status = checkSourceDrift({ name: 'demo', source: 'demo.ts', sourceHash: 'deadbeef' }, temp.dir);

    expect(status.kind).toBe('missing');
  });

  it('returns unverified when the kit has no sourceHash', ({ temp }) => {
    temp.write('demo.ts', 'content');

    const status = checkSourceDrift({ name: 'demo', source: 'demo.ts' }, temp.dir);

    expect(status.kind).toBe('unverified');
  });

  it('returns unverified when the kit has no source', ({ temp }) => {
    const status = checkSourceDrift({ name: 'demo', sourceHash: 'deadbeef' }, temp.dir);

    expect(status.kind).toBe('unverified');
  });

  it('resolves the source path relative to the manifest directory', ({ temp }) => {
    const content = Buffer.from('nested source');
    temp.write('kits/demo.ts', content);

    const status = checkSourceDrift({ name: 'demo', source: 'kits/demo.ts', sourceHash: hashBytes(content) }, temp.dir);

    expect(status.kind).toBe('ok');
  });
});
