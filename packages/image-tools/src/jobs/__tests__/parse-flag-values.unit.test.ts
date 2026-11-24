import { describe, expect, it } from 'vitest';

import { MAX_SEED, parseSeed, parseSize } from '../parse-flag-values.ts';

describe(parseSeed, () => {
  it.each([['0'], ['42'], [String(MAX_SEED)]])('accepts %s', (raw) => {
    expect(parseSeed(raw)).toBe(Number(raw));
  });

  it.each([['-1'], ['1.5'], ['abc'], [''], [String(MAX_SEED + 1)]])('rejects %o, naming the range', (raw) => {
    expect(() => parseSeed(raw)).toThrow(`a seed is an integer from 0 to ${MAX_SEED}, not ${raw}`);
  });
});

describe(parseSize, () => {
  it('reads WIDTHxHEIGHT', () => {
    expect(parseSize('1024x768')).toStrictEqual({ height: 768, width: 1024 });
  });

  it.each([['1000x768'], ['0x768'], ['1024'], ['1024X768'], ['-32x32']])('rejects %o, naming the form', (raw) => {
    expect(() => parseSize(raw)).toThrow('a size is WIDTHxHEIGHT in positive multiples of 32');
  });
});
