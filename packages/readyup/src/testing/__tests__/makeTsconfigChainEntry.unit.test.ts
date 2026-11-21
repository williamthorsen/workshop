import { pointCwdAt } from '@williamthorsen/toolbelt.testing';
import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest';
import { describe, expect, it as baseIt } from 'vitest';

import { readTsconfigChain } from '../../check-utils/tsconfig.ts';
import { makeTsconfigChainEntry } from '../makeTsconfigChainEntry.ts';

const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'rdy-fixture-' })),
);

describe(makeTsconfigChainEntry, () => {
  it('fills every field when given no overrides', () => {
    expect(makeTsconfigChainEntry()).toStrictEqual({
      compilerOptions: {},
      config: {},
      path: 'tsconfig.json',
      specifier: undefined,
    });
  });

  it('derives `compilerOptions` from the config', () => {
    const entry = makeTsconfigChainEntry({ config: { compilerOptions: { strict: true } } });

    expect(entry.compilerOptions).toStrictEqual({ strict: true });
  });

  it('derives an empty `compilerOptions` from a config whose `compilerOptions` is not an object', () => {
    expect(makeTsconfigChainEntry({ config: { compilerOptions: 'strict' } }).compilerOptions).toStrictEqual({});
  });

  it('lets an override win over the derivation', () => {
    const entry = makeTsconfigChainEntry({
      compilerOptions: { target: 'ES2025' },
      config: { compilerOptions: { strict: true } },
    });

    expect(entry.compilerOptions).toStrictEqual({ target: 'ES2025' });
  });

  it('takes `path` and `specifier` from the overrides', () => {
    expect(
      makeTsconfigChainEntry({ path: 'packages/api/tsconfig.json', specifier: '../../tsconfig.json' }),
    ).toMatchObject({
      path: 'packages/api/tsconfig.json',
      specifier: '../../tsconfig.json',
    });
  });
});

describe('fidelity to readTsconfigChain', () => {
  it.aroundEach(async (runTest, { temp }) => {
    using _cwd = pointCwdAt(temp.dir);

    await runTest();
  });

  // Every assertion above reads only the fields that it names, so a builder drifting from the reader would still
  // satisfy them. This one compares the whole value.
  it('reports what the reader reports for the same config, path, and specifier', ({ temp }) => {
    temp.writeJson('tsconfig.json', { compilerOptions: { strict: true }, extends: './tsconfig.base.json' });
    temp.writeJson('tsconfig.base.json', { compilerOptions: 'invalid', include: ['src/'] });

    const entries = readTsconfigChain('tsconfig.json')?.entries ?? [];

    expect(entries.map((entry) => entry.path)).toStrictEqual(['tsconfig.json', 'tsconfig.base.json']);
    for (const entry of entries) {
      const fixture = makeTsconfigChainEntry({ config: entry.config, path: entry.path, specifier: entry.specifier });

      expect(fixture).toStrictEqual(entry);
    }
  });
});
