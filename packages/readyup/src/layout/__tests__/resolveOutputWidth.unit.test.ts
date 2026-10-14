import { describe, expect, it } from 'vitest';

import { resolveOutputWidth } from '../resolveOutputWidth.ts';

describe('resolveOutputWidth', () => {
  it('prefers COLUMNS over the terminal width', () => {
    expect(resolveOutputWidth({ columns: 200, env: { COLUMNS: '80' }, isTty: true })).toBe(80);
  });

  it('honors COLUMNS when output is not a terminal', () => {
    expect(resolveOutputWidth({ columns: undefined, env: { COLUMNS: '80' }, isTty: false })).toBe(80);
  });

  it('accepts a COLUMNS value with leading zeros', () => {
    expect(resolveOutputWidth({ columns: undefined, env: { COLUMNS: '080' }, isTty: false })).toBe(80);
  });

  it.each(['', '0', '-80', ' 80', '80px', '8.5'])('falls through when COLUMNS is %j', (value) => {
    expect(resolveOutputWidth({ columns: 120, env: { COLUMNS: value }, isTty: true })).toBe(120);
  });

  it('uses the terminal width when COLUMNS is unset', () => {
    expect(resolveOutputWidth({ columns: 120, env: {}, isTty: true })).toBe(120);
  });

  it('ignores the reported columns when output is not a terminal', () => {
    expect(resolveOutputWidth({ columns: 120, env: {}, isTty: false })).toBe(Infinity);
  });

  it('has no limit when a terminal reports no width', () => {
    expect(resolveOutputWidth({ columns: 0, env: {}, isTty: true })).toBe(Infinity);
  });
});
