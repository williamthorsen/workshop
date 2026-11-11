import { describe, expect, it } from 'vitest';

import { findRepeats } from '../findRepeats.ts';

describe(findRepeats, () => {
  it('reports nothing for names listed once each', () => {
    expect(findRepeats(['tokens', 'links'], 'targets[0].stages', 'runs')).toStrictEqual([]);
  });

  it('reports a name listed three times once', () => {
    expect(findRepeats(['tokens', 'tokens', 'tokens'], 'targets[0].stages', 'runs')).toStrictEqual([
      { path: 'targets[0].stages', message: expect.stringContaining('"tokens"') },
    ]);
  });

  it('reports repeats in the order they first appear', () => {
    expect(findRepeats(['skill', 'rulebook', 'rulebook', 'skill'], 'targets[0].deployments', 'deploys')).toStrictEqual([
      { path: 'targets[0].deployments', message: expect.stringContaining('"rulebook"') },
      { path: 'targets[0].deployments', message: expect.stringContaining('"skill"') },
    ]);
  });
});
