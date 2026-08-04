import { describe, expect, it } from 'vitest';

import { carriesSentinel, stampSentinel } from '../sentinel.ts';

const SENTINEL = { path: ['source'], value: 'compositor' };
const NESTED = { path: ['meta', 'writtenBy'], value: 'compositor' };

describe(carriesSentinel, () => {
  it('if the item carries the value at the sentinel path, claims it', () => {
    expect(carriesSentinel({ name: 'relay', source: 'compositor' }, SENTINEL)).toBe(true);
  });

  it('if the item carries another value there, does not claim it', () => {
    expect(carriesSentinel({ name: 'relay', source: 'vendor-tool' }, SENTINEL)).toBe(false);
  });

  it('if the item carries nothing there, does not claim it', () => {
    expect(carriesSentinel({ name: 'relay' }, SENTINEL)).toBe(false);
  });

  it('reads a sentinel nested below the item root', () => {
    expect(carriesSentinel({ meta: { writtenBy: 'compositor' } }, NESTED)).toBe(true);
  });

  it('if the item is a scalar, does not claim it', () => {
    expect(carriesSentinel('relay', SENTINEL)).toBe(false);
  });
});

describe(stampSentinel, () => {
  it('marks an item so that it reads back as owned', () => {
    const stamped = stampSentinel({ name: 'relay' }, SENTINEL);

    expect(stamped).toStrictEqual({ name: 'relay', source: 'compositor' });
    expect(carriesSentinel(stamped, SENTINEL)).toBe(true);
  });

  it('creates the mappings a nested sentinel path descends through', () => {
    expect(stampSentinel({ name: 'relay' }, NESTED)).toStrictEqual({
      name: 'relay',
      meta: { writtenBy: 'compositor' },
    });
  });

  it('overwrites a conflicting value rather than leaving an item it could not find again', () => {
    expect(stampSentinel({ source: 'vendor-tool' }, SENTINEL)).toStrictEqual({ source: 'compositor' });
  });

  it('leaves the item it was given alone', () => {
    const item = { name: 'relay' };
    stampSentinel(item, SENTINEL);

    expect(item).toStrictEqual({ name: 'relay' });
  });

  it('if the item cannot hold the sentinel, throws rather than writing an unfindable item', () => {
    expect(() => stampSentinel('relay', SENTINEL)).toThrow(/not a mapping/);
  });

  it('if the sentinel names no key, throws', () => {
    expect(() => stampSentinel({ name: 'relay' }, { path: [], value: 'compositor' })).toThrow(/at least one key/);
  });
});
