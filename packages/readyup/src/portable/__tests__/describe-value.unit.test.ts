import { describe, expect, it } from 'vitest';

import { describeType, describeValue, previewValue } from '../describe-value.ts';

describe(describeType, () => {
  it.each([
    ['string', 'text'],
    ['number', 42],
    ['boolean', true],
    ['undefined', undefined],
    ['function', () => true],
    ['object', {}],
  ])('names a %s', (expected, value) => {
    expect(describeType(value)).toBe(expected);
  });

  it('distinguishes null from object', () => {
    expect(describeType(null)).toBe('null');
  });

  it('distinguishes an array from object', () => {
    expect(describeType([1, 2])).toBe('array');
  });
});

describe(previewValue, () => {
  it('keeps quotes on a string so that it stays distinguishable from a number', () => {
    expect(previewValue('1')).toBe('"1"');
    expect(previewValue(1)).toBe('1');
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['true', true],
    ['{"ok":true}', { ok: true }],
  ])('renders %s', (expected, value) => {
    expect(previewValue(value)).toBe(expected);
  });

  it('names a function rather than rendering its source', () => {
    expect(previewValue(() => true)).toBe('function');
  });

  it('renders a bigint with its literal suffix', () => {
    expect(previewValue(10n)).toBe('10n');
  });

  it('renders a symbol by its description', () => {
    expect(previewValue(Symbol('tag'))).toBe('Symbol(tag)');
  });

  it('truncates a long rendering', () => {
    const preview = previewValue('x'.repeat(200));

    expect(preview).toHaveLength(43);
    expect(preview.endsWith('...')).toBe(true);
  });

  it.each([
    { kind: 'a surrogate pair', padding: 'a'.repeat(38), tail: '\u{1F44D}\u{1F3FC}' },
    {
      kind: 'a ZWJ sequence',
      padding: 'a'.repeat(36),
      tail: '\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}\u{200D}\u{1F466}',
    },
    { kind: 'a combining-mark cluster', padding: 'a'.repeat(38), tail: 'e\u{301}' },
  ])('drops $kind whole rather than cutting into it', ({ padding, tail }) => {
    expect(previewValue(`${padding}${tail}`)).toBe(`"${padding}...`);
  });

  it('renders only the ellipsis when the first cluster alone exceeds the budget', () => {
    expect(previewValue('\u{301}'.repeat(45))).toBe('...');
  });

  it('leaves no unpaired surrogate, wherever the cut falls', () => {
    const paddings = Array.from({ length: 12 }, (_, index) => 30 + index);

    const malformed = paddings.filter(
      (padding) => !previewValue(`${'a'.repeat(padding)}\u{1F44D}\u{1F3FC}`).isWellFormed(),
    );

    expect(malformed).toStrictEqual([]);
  });

  it('falls back to the type name for a value with no JSON rendering', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;

    expect(previewValue(circular)).toBe('object');
  });
});

describe(describeValue, () => {
  it.each([
    ['string "yes"', 'yes'],
    ['number 1', 1],
    ['boolean true', true],
    ['object {"ok":"true"}', { ok: 'true' }],
    ['array []', []],
  ])('describes %s', (expected, value) => {
    expect(describeValue(value)).toBe(expected);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['function', () => true],
  ])('collapses the type and preview of %s into one word', (expected, value) => {
    expect(describeValue(value)).toBe(expected);
  });
});
