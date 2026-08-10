import { describe, expect, it } from 'vitest';

import packageJson from '../../package.json' with { type: 'json' };
import { VERSION } from '../version.ts';

describe('VERSION', () => {
  // `VERSION` reaches the manifest by a run-time directory ascent and the expectation by a fixed relative path, so a
  // misdirected ascent fails here.
  it('matches the version the package manifest declares', () => {
    expect(VERSION).toBe(packageJson.version);
  });
});
