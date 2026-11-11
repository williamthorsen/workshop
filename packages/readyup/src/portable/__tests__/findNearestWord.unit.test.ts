import { describe, expect, it } from 'vitest';

import { findNearestWord } from '../findNearestWord.ts';

const COMMANDS = ['compile', 'help', 'init', 'list', 'run', 'verify'];

describe(findNearestWord, () => {
  it.each([
    { label: 'an exact word', input: 'list', expected: 'list' },
    { label: 'a truncation', input: 'comp', expected: 'compile' },
    { label: 'a single wrong letter', input: 'rin', expected: 'run' },
    { label: 'a transposition', input: 'hlep', expected: 'help' },
    { label: 'a missing letter', input: 'lst', expected: 'list' },
  ])('matches $label', ({ input, expected }) => {
    expect(findNearestWord(input, COMMANDS)).toBe(expected);
  });

  it.each([
    { label: 'a word too far from every candidate', input: 'zzzzz' },
    { label: 'the empty string', input: '' },
    { label: 'a long flag', input: '--json' },
    { label: 'a short flag', input: '-h' },
    { label: 'a two-letter typo, which is as many edits away as it has characters', input: 'ls' },
  ])('returns undefined for $label', ({ input }) => {
    expect(findNearestWord(input, COMMANDS)).toBeUndefined();
  });

  it('prefers an abbreviation over a nearer typo', () => {
    expect(findNearestWord('lis', ['lit', 'listing'])).toBe('listing');
  });

  it('prefers the shortest abbreviated candidate', () => {
    expect(findNearestWord('hel', ['hello', 'help'])).toBe('help');
  });

  it('returns undefined when the candidate list is empty', () => {
    expect(findNearestWord('list', [])).toBeUndefined();
  });

  it('prefers the nearer candidate over the earlier one', () => {
    expect(findNearestWord('abd', ['axe', 'abe'])).toBe('abe');
  });

  it('breaks a tie on candidate order, which an alphabetized list makes alphabetical', () => {
    expect(findNearestWord('ax', ['ay', 'az'])).toBe('ay');
  });

  it('matches against whichever candidates the caller supplies', () => {
    expect(findNearestWord('authorng', ['authoring', 'concepts'])).toBe('authoring');
  });
});
