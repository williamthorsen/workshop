import { describe, expect, it } from 'vitest';

import { safeJsonParse } from '../src/safeJsonParse.ts';

describe(safeJsonParse, () => {
  it('parses a valid JSON object', () => {
    expect(safeJsonParse('{"key":"value"}')).toEqual({ key: 'value' });
  });

  it('parses a valid JSON array', () => {
    expect(safeJsonParse('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('parses a JSON number', () => {
    expect(safeJsonParse('42')).toBe(42);
  });

  it('parses a JSON string', () => {
    expect(safeJsonParse('"hello"')).toBe('hello');
  });

  it('parses a JSON boolean', () => {
    expect(safeJsonParse('true')).toBe(true);
  });

  it('parses JSON null', () => {
    expect(safeJsonParse('null')).toBeNull();
  });

  it('returns undefined for malformed JSON', () => {
    expect(safeJsonParse('{ not valid json }}}')).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    expect(safeJsonParse('')).toBeUndefined();
  });
});
