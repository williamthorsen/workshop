import { describe, expect, it } from 'vitest';

import { buildInlayPatterns } from '../buildInlayPatterns.ts';

const comment = buildInlayPatterns({ open: '<!--', close: '-->' });

describe(buildInlayPatterns, () => {
  it('captures the name of a directive', () => {
    expect(comment.inlay.exec('<!-- inlay: implementation-preferences -->')?.[1]).toBe('implementation-preferences');
  });

  it('matches a directive naming nothing without capturing a name', () => {
    expect(comment.anyInlay.test('<!-- inlay: -->')).toBe(true);
    expect(comment.inlay.test('<!-- inlay: -->')).toBe(false);
  });

  it('matches a directive containing an unrecognized parameter without capturing it as a name', () => {
    const malformed = '<!-- inlay: preferences extra -->';

    expect(comment.anyInlay.test(malformed)).toBe(true);
    expect(comment.inlay.test(malformed)).toBe(false);
  });

  it('does not match a line that merely mentions the keyword', () => {
    expect(comment.anyInlay.test('The inlay: stage runs last.')).toBe(false);
  });

  it('recognizes the same directive behind a fence that runs to the end of the line', () => {
    const hash = buildInlayPatterns({ open: '#', close: '' });

    expect(hash.inlay.exec('# inlay: preferences')?.[1]).toBe('preferences');
    expect(hash.anyInlay.test('# inlay:')).toBe(true);
  });

  it('matches a fence containing regular-expression syntax literally', () => {
    const brackets = buildInlayPatterns({ open: '[[', close: ']]' });

    expect(brackets.inlay.exec('[[ inlay: preferences ]]')?.[1]).toBe('preferences');
    expect(brackets.inlay.test('c inlay: preferences c')).toBe(false);
  });

  it('ignores leading and trailing whitespace around a directive', () => {
    expect(comment.inlay.exec('\t  <!--inlay:preferences-->  ')?.[1]).toBe('preferences');
  });
});
