import { describe, expect, it } from 'vitest';

import { parseRunnerValue, parseVisibility } from '../github-repo.ts';

describe(parseRunnerValue, () => {
  it.each([
    ['a bare label', 'imac2', 'imac2'],
    ['a bare label with surrounding whitespace', '  imac2\n', 'imac2'],
    ['a JSON string', '"imac2"', 'imac2'],
    ['a JSON string with padding inside the quotes', '" imac2 "', 'imac2'],
  ])('reads %s', (_, raw, label) => {
    expect(parseRunnerValue(raw)).toBe(label);
  });

  it.each([
    ['a JSON array', '["self-hosted","linux"]', 'selects more than one label: ["self-hosted","linux"]'],
    ['a JSON object', '{"group":"mac"}', 'selects more than one label: {"group":"mac"}'],
    ['malformed JSON after a quote', '"imac2', 'is not valid JSON: "imac2'],
    ['an empty value', '  ', 'is empty'],
    ['a JSON string that decodes to nothing', '""', 'is empty'],
  ])('reports %s', (_, raw, problem) => {
    expect(parseRunnerValue(raw)).toStrictEqual({ problem });
  });
});

describe(parseVisibility, () => {
  it('accepts public and private alone', () => {
    expect(parseVisibility('public')).toBe('public');
    expect(parseVisibility('private')).toBe('private');
    expect(parseVisibility('internal')).toBeUndefined();
  });
});
