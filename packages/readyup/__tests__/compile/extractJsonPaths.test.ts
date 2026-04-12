import { describe, expect, it } from 'vitest';

import { extractJsonPaths } from '../../src/compile/extractJsonPaths.ts';

describe(extractJsonPaths, () => {
  it('extracts a top-level key by string', () => {
    const obj = { name: 'my-pkg', version: '1.0.0' };

    expect(extractJsonPaths(obj, ['name'])).toEqual({ name: 'my-pkg' });
  });

  it('extracts multiple top-level keys', () => {
    const obj = { name: 'my-pkg', version: '1.0.0', license: 'MIT' };

    expect(extractJsonPaths(obj, ['name', 'version'])).toEqual({
      name: 'my-pkg',
      version: '1.0.0',
    });
  });

  it('extracts a nested key by array path', () => {
    const obj = { publishConfig: { access: 'public', registry: 'https://npm.pkg.github.com' } };

    expect(extractJsonPaths(obj, [['publishConfig', 'access']])).toEqual({
      publishConfig: { access: 'public' },
    });
  });

  it('extracts mixed top-level and nested paths in a single call', () => {
    const obj = {
      name: 'my-pkg',
      version: '1.0.0',
      repository: { type: 'git', url: 'https://example.com' },
    };

    expect(extractJsonPaths(obj, ['name', ['repository', 'url']])).toEqual({
      name: 'my-pkg',
      repository: { url: 'https://example.com' },
    });
  });

  it('preserves nested structure when extracting sibling nested paths', () => {
    const obj = { a: { b: 1, c: 2, d: 3 } };

    expect(
      extractJsonPaths(obj, [
        ['a', 'b'],
        ['a', 'c'],
      ]),
    ).toEqual({
      a: { b: 1, c: 2 },
    });
  });

  it('preserves deeply nested values', () => {
    const obj = { a: { b: { c: { d: 42 } } } };

    expect(extractJsonPaths(obj, [['a', 'b', 'c', 'd']])).toEqual({
      a: { b: { c: { d: 42 } } },
    });
  });

  it('throws when a top-level path is missing', () => {
    const obj = { name: 'my-pkg' };

    expect(() => extractJsonPaths(obj, ['missing'])).toThrow('Path not found in JSON: missing');
  });

  it('throws when a nested path is missing', () => {
    const obj = { a: { b: 1 } };

    expect(() => extractJsonPaths(obj, [['a', 'c']])).toThrow('Path not found in JSON: a.c');
  });

  it('throws when an intermediate segment is not an object', () => {
    const obj = { a: 'string-value' };

    expect(() => extractJsonPaths(obj, [['a', 'b']])).toThrow('Path not found in JSON: a.b');
  });

  it('extracts null values without throwing', () => {
    const obj = { key: null };

    expect(extractJsonPaths(obj, ['key'])).toEqual({ key: null });
  });

  it('returns an empty object when given no paths', () => {
    expect(extractJsonPaths({ a: 1 }, [])).toEqual({});
  });

  it('skips empty array paths', () => {
    expect(extractJsonPaths({ a: 1 }, [[], 'a'])).toEqual({ a: 1 });
  });

  it('handles duplicate path requests by deduplicating', () => {
    const obj = { name: 'my-pkg', version: '1.0.0' };

    const result = extractJsonPaths(obj, ['name', 'name']);

    expect(result).toEqual({ name: 'my-pkg' });
    expect(Object.keys(result)).toEqual(['name']);
  });
});
