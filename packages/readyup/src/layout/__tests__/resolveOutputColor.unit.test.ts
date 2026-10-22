import { describe, expect, it } from 'vitest';

import { resolveOutputColor } from '../resolveOutputColor.ts';

describe(resolveOutputColor, () => {
  it('colours by default', () => {
    expect(resolveOutputColor({ env: {} })).toBe(true);
  });

  it.each(['1', 'false'])('turns colour off for NO_COLOR=%s', (value) => {
    expect(resolveOutputColor({ env: { NO_COLOR: value } })).toBe(false);
  });

  it('reads an empty NO_COLOR as unset', () => {
    expect(resolveOutputColor({ env: { NO_COLOR: '' } })).toBe(true);
  });

  it('turns colour off for TERM=dumb', () => {
    expect(resolveOutputColor({ env: { TERM: 'dumb' } })).toBe(false);
  });

  it('colours under any other TERM', () => {
    expect(resolveOutputColor({ env: { TERM: 'xterm-256color' } })).toBe(true);
  });
});
