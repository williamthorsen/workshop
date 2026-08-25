import { describe, expect, it } from 'vitest';

import { buildDirectivePatterns } from '../buildDirectivePatterns.ts';

const comment = buildDirectivePatterns({ open: '<!--', close: '-->' });

describe(buildDirectivePatterns, () => {
  it('captures the target of a self-closing directive', () => {
    expect(comment.selfClose.exec('<!-- include: _data/shared.md / -->')?.[1]).toBe('_data/shared.md');
  });

  it('captures the target of an opening directive', () => {
    expect(comment.open.exec('<!-- include: _data/frame.md -->')?.[1]).toBe('_data/frame.md');
  });

  it('recognizes the closing directive and the children placeholder', () => {
    expect(comment.close.test('<!-- /include -->')).toBe(true);
    expect(comment.children.test('<!-- children -->')).toBe(true);
  });

  it('does not read a self-closing directive as an opening one', () => {
    expect(comment.open.test('<!-- include: _data/shared.md / -->')).toBe(false);
  });

  it('matches a directive containing an unrecognized parameter without capturing it as a target', () => {
    const malformed = '<!-- include: _data/shared.md extra -->';

    expect(comment.anyInclude.test(malformed)).toBe(true);
    expect(comment.open.test(malformed)).toBe(false);
    expect(comment.selfClose.test(malformed)).toBe(false);
  });

  it('recognizes the same directives behind a fence that runs to the end of the line', () => {
    const hash = buildDirectivePatterns({ open: '#', close: '' });

    expect(hash.selfClose.exec('# include: _data/shared.md /')?.[1]).toBe('_data/shared.md');
    expect(hash.open.exec('# include: _data/frame.md')?.[1]).toBe('_data/frame.md');
    expect(hash.close.test('# /include')).toBe(true);
    expect(hash.children.test('# children')).toBe(true);
  });

  it('matches a fence containing regular-expression syntax literally', () => {
    const brackets = buildDirectivePatterns({ open: '[[', close: ']]' });

    expect(brackets.children.test('[[ children ]]')).toBe(true);
    expect(brackets.children.test('c children c')).toBe(false);
  });

  it('ignores leading and trailing whitespace around a directive', () => {
    expect(comment.close.test('\t  <!--/include-->  ')).toBe(true);
  });
});
