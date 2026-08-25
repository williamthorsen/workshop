import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

import { toError } from '../toError.ts';

describe(toError, () => {
  it('returns an Error unchanged', () => {
    const error = new Error('boom');

    expect(toError(error)).toBe(error);
  });

  it('returns an error thrown in another realm unchanged', () => {
    // A foreign realm has its own `Error`, so `instanceof` reports false for this value.
    const foreign: unknown = runInNewContext('new Error("boom")');

    expect(toError(foreign)).toBe(foreign);
  });

  it.each([
    ['a string', 'boom', 'boom'],
    ['a number', 42, '42'],
    ['null', null, 'null'],
    ['undefined', undefined, 'undefined'],
  ])('wraps %s in an Error with its text', (_label, value, expected) => {
    expect(toError(value).message).toBe(expected);
  });

  it('wraps a value that has no rendering rather than throwing', () => {
    // A null-prototype object inherits no `toString`, so `String()` on it throws.
    const unrenderable: unknown = Object.create(null);

    expect(toError(unrenderable)).toBeInstanceOf(Error);
  });
});
