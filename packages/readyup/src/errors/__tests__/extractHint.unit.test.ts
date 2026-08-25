import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

import { extractHint } from '../error-handling.ts';
import { configError } from '../RdyError.ts';

describe(extractHint, () => {
  it('returns the hint an RdyError has', () => {
    expect(extractHint(configError('boom', { hint: 'Set GITHUB_TOKEN.' }))).toBe('Set GITHUB_TOKEN.');
  });

  it('returns the hint attached to a plain Error, which is how a non-RdyError forwards one', () => {
    expect(extractHint(Object.assign(new Error('boom'), { hint: 'Install it.' }))).toBe('Install it.');
  });

  it('returns the hint on an error thrown in another realm', () => {
    // A foreign realm has its own `Error`, so `instanceof` reports false for this value.
    const foreign: unknown = runInNewContext('Object.assign(new Error("boom"), { hint: "Install it." })');

    expect(extractHint(foreign)).toBe('Install it.');
  });

  it('returns undefined for an error with no hint', () => {
    expect(extractHint(new Error('boom'))).toBeUndefined();
  });

  it('returns undefined for a hint that is not a string', () => {
    expect(extractHint(Object.assign(new Error('boom'), { hint: 42 }))).toBeUndefined();
  });

  it.each([
    ['a string', 'raw string'],
    ['a plain object with a hint', { hint: 'not an Error' }],
    ['null', null],
    ['undefined', undefined],
  ])('returns undefined for %s', (_label, value) => {
    expect(extractHint(value)).toBeUndefined();
  });
});
