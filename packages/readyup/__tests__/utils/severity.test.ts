import { describe, expect, it } from 'vitest';

import { worseSeverity } from '../../src/utils/severity.ts';

describe(worseSeverity, () => {
  it('returns null when both arguments are null', () => {
    expect(worseSeverity(null, null)).toBe(null);
  });

  it('returns the non-null value when one argument is null', () => {
    expect(worseSeverity(null, 'recommend')).toBe('recommend');
    expect(worseSeverity('warn', null)).toBe('warn');
    expect(worseSeverity(null, 'error')).toBe('error');
  });

  it('returns error when either argument is error', () => {
    expect(worseSeverity('error', 'warn')).toBe('error');
    expect(worseSeverity('warn', 'error')).toBe('error');
    expect(worseSeverity('error', 'recommend')).toBe('error');
    expect(worseSeverity('recommend', 'error')).toBe('error');
    expect(worseSeverity('error', 'error')).toBe('error');
  });

  it('returns warn when either argument is warn and neither is error', () => {
    expect(worseSeverity('warn', 'recommend')).toBe('warn');
    expect(worseSeverity('recommend', 'warn')).toBe('warn');
    expect(worseSeverity('warn', 'warn')).toBe('warn');
  });

  it('returns recommend when both arguments are recommend', () => {
    expect(worseSeverity('recommend', 'recommend')).toBe('recommend');
  });
});
