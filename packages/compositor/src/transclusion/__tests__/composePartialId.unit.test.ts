import { describe, expect, it } from 'vitest';

import { composePartialId } from '../composePartialId.ts';

describe(composePartialId, () => {
  it('composes an id from the source and the path the partial sits at within it', () => {
    expect(composePartialId('team', '_data/shared.md')).toBe('team:_data/shared.md');
  });

  it('gives two sources carrying one path two ids, since a partial belongs to the source that holds it', () => {
    expect(composePartialId('team', '_data/shared.md')).not.toBe(composePartialId('library', '_data/shared.md'));
  });
});
