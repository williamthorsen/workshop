import { describe, expect, it } from 'vitest';

import { configError } from '../../src/errors.ts';
import { extractHint } from '../../src/utils/error-handling.ts';

describe(extractHint, () => {
  it('returns the hint an RdyError carries', () => {
    expect(extractHint(configError('boom', { hint: 'Set GITHUB_TOKEN.' }))).toBe('Set GITHUB_TOKEN.');
  });

  it('returns the hint attached to a plain Error, which is how a non-RdyError forwards one', () => {
    expect(extractHint(Object.assign(new Error('boom'), { hint: 'Install it.' }))).toBe('Install it.');
  });

  it('returns undefined for an error carrying no hint', () => {
    expect(extractHint(new Error('boom'))).toBeUndefined();
  });

  it('returns undefined for a hint that is not a string', () => {
    expect(extractHint(Object.assign(new Error('boom'), { hint: 42 }))).toBeUndefined();
  });

  it.each([
    ['a string', 'raw string'],
    ['a plain object carrying a hint', { hint: 'not an Error' }],
    ['null', null],
    ['undefined', undefined],
  ])('returns undefined for %s', (_label, value) => {
    expect(extractHint(value)).toBeUndefined();
  });
});
