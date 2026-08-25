import { describe, expect, it } from 'vitest';

import { isJsFamilyPath, listPragmaSites } from '../listPragmaSites.ts';

describe(listPragmaSites, () => {
  describe('given a token anchored to a comment', () => {
    it('lists a line comment trailing the code it covers', () => {
      const sites = listPragmaSites('error instanceof Error; // rdy-ignore\n');

      expect(sites).toStrictEqual([{ coveredLine: 1, line: 1, token: 'rdy-ignore' }]);
    });

    it('lists a line comment on the line above the one it covers', () => {
      const sites = listPragmaSites(['// rdy-ignore-next-line', 'error instanceof Error;', ''].join('\n'));

      expect(sites).toStrictEqual([{ coveredLine: 2, line: 1, token: 'rdy-ignore-next-line' }]);
    });

    it('lists a block comment', () => {
      const sites = listPragmaSites('/* rdy-ignore */ error instanceof Error;\n');

      expect(sites).toStrictEqual([{ coveredLine: 1, line: 1, token: 'rdy-ignore' }]);
    });

    it('lists a JSDoc continuation line directly below the opening delimiter', () => {
      const sites = listPragmaSites(
        ['/**', ' * rdy-ignore-next-line', ' */', 'error instanceof Error;', ''].join('\n'),
      );

      expect(sites).toStrictEqual([{ coveredLine: 3, line: 2, token: 'rdy-ignore-next-line' }]);
    });

    it('lists a token the comment holds with no space after the delimiter', () => {
      const sites = listPragmaSites('x; //rdy-ignore\n');

      expect(sites).toStrictEqual([{ coveredLine: 1, line: 1, token: 'rdy-ignore' }]);
    });

    it('reports the line of each token in a source holding several', () => {
      const sites = listPragmaSites(['// rdy-ignore', 'x;', '/* rdy-ignore-next-line */', 'y;', ''].join('\n'));

      expect(sites).toStrictEqual([
        { coveredLine: 1, line: 1, token: 'rdy-ignore' },
        { coveredLine: 4, line: 3, token: 'rdy-ignore-next-line' },
      ]);
    });
  });

  describe('given a token the comment rule withholds', () => {
    it('lists nothing for a token in a string literal', () => {
      expect(listPragmaSites("const token = 'rdy-ignore';\n")).toStrictEqual([]);
    });

    it('lists nothing for a token in a regular expression', () => {
      expect(listPragmaSites('const pattern = /rdy-ignore/;\n')).toStrictEqual([]);
    });

    it('lists nothing for a token following prose inside a comment', () => {
      expect(listPragmaSites('// The token to write is rdy-ignore\n')).toStrictEqual([]);
    });

    it('lists nothing for a token following commented-out code', () => {
      expect(listPragmaSites('// const a = 1; rdy-ignore\n')).toStrictEqual([]);
    });

    it('lists only the first of two tokens on one line', () => {
      const sites = listPragmaSites('x; // rdy-ignore rdy-ignore-next-line\n');

      expect(sites).toStrictEqual([{ coveredLine: 1, line: 1, token: 'rdy-ignore' }]);
    });

    it('lists nothing for a token in bare code', () => {
      expect(listPragmaSites('const flag = rdy-ignore;\n')).toStrictEqual([]);
    });

    it('lists nothing for a word the token is only the head of', () => {
      expect(listPragmaSites('// rdy-ignored\n')).toStrictEqual([]);
    });
  });

  it('lists the tokens a source holds beside a reason', () => {
    const sites = listPragmaSites('x; // rdy-ignore toolbelt.errors/no-instanceof-error -- reviewed\n');

    expect(sites).toStrictEqual([{ coveredLine: 1, line: 1, token: 'rdy-ignore' }]);
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
