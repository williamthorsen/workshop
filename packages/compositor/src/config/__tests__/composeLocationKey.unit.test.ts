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

  // A relative base stays relative, so the key never depends on the working directory the fold happens to run in.
  it('leaves a relative base directory relative', () => {
    expect(composeLocationKey('./app', '@acme/x')).toBe(composeLocationKey('app', '@acme/x'));
  });
});
