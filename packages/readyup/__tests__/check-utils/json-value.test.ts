import { describe, expect, it } from 'vitest';

import { getJsonValue, hasJsonValue } from '../../src/check-utils/json-value.ts';

describe(getJsonValue, () => {
  it('returns a top-level value', () => {
    expect(getJsonValue({ name: 'foo' }, 'name')).toBe('foo');
  });

  it('returns a nested value', () => {
    const obj = { publishConfig: { access: 'public' } };

    expect(getJsonValue(obj, 'publishConfig', 'access')).toBe('public');
  });

  it('returns a deeply nested value', () => {
    const obj = { a: { b: { c: { d: 42 } } } };

    expect(getJsonValue(obj, 'a', 'b', 'c', 'd')).toBe(42);
  });

  it('returns undefined when a key is missing', () => {
    expect(getJsonValue({ name: 'foo' }, 'missing')).toBeUndefined();
  });

  it('returns undefined when an intermediate key is missing', () => {
    const obj = { a: { b: 'value' } };

    expect(getJsonValue(obj, 'a', 'missing', 'deep')).toBeUndefined();
  });

  it('returns undefined when an intermediate value is not a record', () => {
    const obj = { items: [1, 2, 3] };

    expect(getJsonValue(obj, 'items', 'length')).toBeUndefined();
  });

  it('returns undefined when an intermediate value is a string', () => {
    const obj = { name: 'foo' };

    expect(getJsonValue(obj, 'name', 'length')).toBeUndefined();
  });

  it('returns the object itself when no keys are provided', () => {
    const obj = { name: 'foo' };

    expect(getJsonValue(obj)).toBe(obj);
  });

  it('returns null when the value at the path is null', () => {
    const obj = { key: null };

    expect(getJsonValue(obj, 'key')).toBeNull();
  });
});

describe(hasJsonValue, () => {
  it('returns true when a non-nullish value exists', () => {
    const obj = { publishConfig: { access: 'public' } };

    expect(hasJsonValue(obj, 'publishConfig', 'access')).toBe(true);
  });

  it('returns true for falsy but non-nullish values', () => {
    expect(hasJsonValue({ count: 0 }, 'count')).toBe(true);
    expect(hasJsonValue({ flag: false }, 'flag')).toBe(true);
    expect(hasJsonValue({ label: '' }, 'label')).toBe(true);
  });

  it('returns false when the key is missing', () => {
    expect(hasJsonValue({ name: 'foo' }, 'missing')).toBe(false);
  });

  it('returns false when the value is null', () => {
    expect(hasJsonValue({ key: null }, 'key')).toBe(false);
  });

  it('returns false when the value is undefined', () => {
    expect(hasJsonValue({ key: undefined }, 'key')).toBe(false);
  });

  it('returns false when an intermediate key is missing', () => {
    expect(hasJsonValue({ a: {} }, 'a', 'b', 'c')).toBe(false);
  });
});
