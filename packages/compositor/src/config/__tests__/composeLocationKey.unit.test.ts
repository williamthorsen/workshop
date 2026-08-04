import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { composeLocationKey } from '../composeLocationKey.ts';

describe(composeLocationKey, () => {
  it('composes one key for two spellings of one base directory', () => {
    expect(composeLocationKey('/srv/app/', '@acme/x')).toBe(composeLocationKey('/srv/app', '@acme/x'));
  });

  it('composes one key for a base directory carrying a redundant segment', () => {
    expect(composeLocationKey('/srv/./app', '@acme/x')).toBe(composeLocationKey('/srv/app', '@acme/x'));
  });

  it('composes different keys for one package under different base directories', () => {
    expect(composeLocationKey('/srv/global', '@acme/x')).not.toBe(composeLocationKey('/srv/project', '@acme/x'));
  });

  it('composes different keys for two packages under one base directory', () => {
    expect(composeLocationKey('/srv/app', '@acme/x')).not.toBe(composeLocationKey('/srv/app', '@acme/y'));
  });

  // Resolving a relative base would collapse these two into one key, which is the ambient reading the pure fold that
  // reads these keys back cannot afford.
  it('keys a relative base apart from the directory it would resolve against', () => {
    expect(composeLocationKey('app', '@acme/x')).not.toBe(composeLocationKey(path.resolve('app'), '@acme/x'));
  });
});
