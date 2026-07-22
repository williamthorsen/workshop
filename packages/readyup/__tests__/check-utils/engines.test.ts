import { describe, expect, it } from 'vitest';

import { readEnginesNodeFloor, satisfiesNodeFloor } from '../../src/check-utils/engines.ts';

describe(readEnginesNodeFloor, () => {
  it('reads a `>=` floor', () => {
    expect(readEnginesNodeFloor({ engines: { node: '>=20.6.0' } })).toEqual({
      kind: 'found',
      floor: '20.6.0',
      raw: '>=20.6.0',
    });
  });

  it('reads a caret floor', () => {
    expect(readEnginesNodeFloor({ engines: { node: '^22.0.0' } })).toEqual({
      kind: 'found',
      floor: '22.0.0',
      raw: '^22.0.0',
    });
  });

  it('reads a bare version as its own floor', () => {
    expect(readEnginesNodeFloor({ engines: { node: '24.1.0' } })).toEqual({
      kind: 'found',
      floor: '24.1.0',
      raw: '24.1.0',
    });
  });

  it('keeps a partial version as written', () => {
    expect(readEnginesNodeFloor({ engines: { node: '>=24' } })).toMatchObject({ kind: 'found', floor: '24' });
    expect(readEnginesNodeFloor({ engines: { node: '^20.6' } })).toMatchObject({ kind: 'found', floor: '20.6' });
  });

  it('tolerates whitespace around and after the operator', () => {
    expect(readEnginesNodeFloor({ engines: { node: '  >= 24  ' } })).toEqual({
      kind: 'found',
      floor: '24',
      raw: '  >= 24  ',
    });
  });

  it.each([
    ['no engines field', {}],
    ['a non-record engines field', { engines: 'node' }],
    ['no engines.node field', { engines: { npm: '>=10' } }],
    ['a non-string engines.node field', { engines: { node: 24 } }],
  ])('reports absence for %s', (_label, manifest) => {
    expect(readEnginesNodeFloor(manifest)).toEqual({ kind: 'absent' });
  });

  it.each(['^20 || ^22', '20 - 22', '20.x', '*', '>24', '~20.1'])('reports %s as unparseable', (range) => {
    expect(readEnginesNodeFloor({ engines: { node: range } })).toEqual({ kind: 'unparseable', raw: range });
  });
});

describe(satisfiesNodeFloor, () => {
  it('is true at the floor', () => {
    expect(satisfiesNodeFloor('20.6.0', '20.6.0')).toBe(true);
  });

  it('is true above the floor', () => {
    expect(satisfiesNodeFloor('24.18.0', '20.6.0')).toBe(true);
  });

  it('is false below the floor', () => {
    expect(satisfiesNodeFloor('20.5.9', '20.6.0')).toBe(false);
  });

  it('treats a partial floor as zero-filled', () => {
    expect(satisfiesNodeFloor('24.0.0', '24')).toBe(true);
    expect(satisfiesNodeFloor('23.9.9', '24')).toBe(false);
  });

  it('accepts a leading `v`, as `process.version` carries', () => {
    expect(satisfiesNodeFloor('v24.18.0', '24')).toBe(true);
    expect(satisfiesNodeFloor('v20.6.0', 'v24')).toBe(false);
  });

  it.each(['lts', 'latest', 'system', 'ref:v24.0.0', 'lts-jod', '24.18.0-rc.1', ''])(
    'returns undefined for the uncomparable version %s',
    (version) => {
      expect(satisfiesNodeFloor(version, '24')).toBeUndefined();
    },
  );

  it('returns undefined for an uncomparable floor', () => {
    expect(satisfiesNodeFloor('24.18.0', 'latest')).toBeUndefined();
  });
});
