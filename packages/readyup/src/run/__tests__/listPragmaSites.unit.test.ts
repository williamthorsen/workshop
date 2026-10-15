import { describe, expect, it } from 'vitest';

import { isJsFamilyPath, listPragmaSites } from '../listPragmaSites.ts';

describe(listPragmaSites, () => {
  describe('given a token anchored to a comment', () => {
    it('lists a line comment trailing the code that it covers', () => {
      const sites = listPragmaSites('error instanceof Error; // rdy-ignore\n');

      expect(sites).toStrictEqual([{ checkIds: [], coveredLine: 1, line: 1, token: 'rdy-ignore' }]);
    });

    it('lists a line comment on the line above the one that it covers', () => {
      const sites = listPragmaSites(['// rdy-ignore-next-line', 'error instanceof Error;', ''].join('\n'));

      expect(sites).toStrictEqual([{ checkIds: [], coveredLine: 2, line: 1, token: 'rdy-ignore-next-line' }]);
    });

    it('lists a block comment', () => {
      const sites = listPragmaSites('/* rdy-ignore */ error instanceof Error;\n');

      expect(sites).toStrictEqual([{ checkIds: [], coveredLine: 1, line: 1, token: 'rdy-ignore' }]);
    });

    it('lists a JSDoc continuation line directly below the opening delimiter', () => {
      const sites = listPragmaSites(
        ['/**', ' * rdy-ignore-next-line', ' */', 'error instanceof Error;', ''].join('\n'),
      );

      expect(sites).toStrictEqual([{ checkIds: [], coveredLine: 3, line: 2, token: 'rdy-ignore-next-line' }]);
    });

    it('lists a token that the comment contains with no space after the delimiter', () => {
      const sites = listPragmaSites('x; //rdy-ignore\n');

      expect(sites).toStrictEqual([{ checkIds: [], coveredLine: 1, line: 1, token: 'rdy-ignore' }]);
    });

    it('reports the line of each token in a source containing several', () => {
      const sites = listPragmaSites(['// rdy-ignore', 'x;', '/* rdy-ignore-next-line */', 'y;', ''].join('\n'));

      expect(sites).toStrictEqual([
        { checkIds: [], coveredLine: 1, line: 1, token: 'rdy-ignore' },
        { checkIds: [], coveredLine: 4, line: 3, token: 'rdy-ignore-next-line' },
      ]);
    });
  });

  describe('given a pragma naming checks', () => {
    it('lists the one check id that the pragma names', () => {
      const sites = listPragmaSites('x; // rdy-ignore no-instanceof-error\n');

      expect(sites.map((site) => site.checkIds)).toStrictEqual([['no-instanceof-error']]);
    });

    it('lists every id of a comma-separated list', () => {
      const sites = listPragmaSites('x; // rdy-ignore toolbelt.errors/a, b\n');

      expect(sites.map((site) => site.checkIds)).toStrictEqual([['toolbelt.errors/a', 'b']]);
    });

    it('ends the list at a reason', () => {
      const sites = listPragmaSites('// rdy-ignore-next-line a -- the shim\nx;\n');

      expect(sites.map((site) => site.checkIds)).toStrictEqual([['a']]);
    });

    it('ends the list at a block comment closed against the last id', () => {
      const sites = listPragmaSites('/* rdy-ignore a*/ x;\n');

      expect(sites.map((site) => site.checkIds)).toStrictEqual([['a']]);
    });

    it('ends the list at the line end rather than reading the next line', () => {
      const sites = listPragmaSites('// rdy-ignore-next-line\nb;\n');

      expect(sites.map((site) => site.checkIds)).toStrictEqual([[]]);
    });
  });

  describe('given a token excluded by the comment rule', () => {
    it('lists no site for a token in a string literal', () => {
      expect(listPragmaSites("const token = 'rdy-ignore';\n")).toStrictEqual([]);
    });

    it('lists no site for a token in a regular expression', () => {
      expect(listPragmaSites('const pattern = /rdy-ignore/;\n')).toStrictEqual([]);
    });

    it('lists no site for a token following prose inside a comment', () => {
      expect(listPragmaSites('// The token to write is rdy-ignore\n')).toStrictEqual([]);
    });

    it('lists no site for a token following commented-out code', () => {
      expect(listPragmaSites('// const a = 1; rdy-ignore\n')).toStrictEqual([]);
    });

    it('lists only the first of two tokens on one line', () => {
      const sites = listPragmaSites('x; // rdy-ignore rdy-ignore-next-line\n');

      expect(sites).toStrictEqual([{ checkIds: [], coveredLine: 1, line: 1, token: 'rdy-ignore' }]);
    });

    it('lists no site for a token in bare code', () => {
      expect(listPragmaSites('const flag = rdy-ignore;\n')).toStrictEqual([]);
    });

    it('lists no site for a word of which the token is only the head', () => {
      expect(listPragmaSites('// rdy-ignored\n')).toStrictEqual([]);
    });
  });

  it('lists the tokens that a source contains beside a reason', () => {
    const sites = listPragmaSites('x; // rdy-ignore toolbelt.errors/no-instanceof-error -- reviewed\n');

    expect(sites).toStrictEqual([
      { checkIds: ['toolbelt.errors/no-instanceof-error'], coveredLine: 1, line: 1, token: 'rdy-ignore' },
    ]);
  });
});

describe(isJsFamilyPath, () => {
  it.each(['src/a.ts', 'src/a.tsx', 'src/a.js', 'src/a.jsx', 'src/a.mjs', 'src/a.cts'])('recognizes %s', (path) => {
    expect(isJsFamilyPath(path)).toBe(true);
  });

  it.each(['README.md', 'config.yaml', 'a.ts.snap', 'Makefile'])('passes over %s', (path) => {
    expect(isJsFamilyPath(path)).toBe(false);
  });
});
