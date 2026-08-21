import { describe, expect, it } from 'vitest';

import { declinesFinding } from '../declinesFinding.ts';

describe(declinesFinding, () => {
  describe('given an `rdy-ignore`', () => {
    it('declines a finding on the line it sits on', () => {
      const lines = linesOf('const a = 1;\nerror instanceof Error; // rdy-ignore\nconst b = 2;');

      expect(declinesFinding(lines, 2)).toBe(true);
    });

    it('declines nothing on the line below it', () => {
      const lines = linesOf('// rdy-ignore\nerror instanceof Error;');

      expect(declinesFinding(lines, 2)).toBe(false);
    });

    it('declines a finding on the first line', () => {
      const lines = linesOf('error instanceof Error; // rdy-ignore');

      expect(declinesFinding(lines, 1)).toBe(true);
    });
  });

  describe('given an `rdy-ignore-next-line`', () => {
    it('declines a finding on the line below it', () => {
      const lines = linesOf('// rdy-ignore-next-line\nerror instanceof Error;');

      expect(declinesFinding(lines, 2)).toBe(true);
    });

    it('declines nothing on the line it sits on', () => {
      const lines = linesOf('error instanceof Error; // rdy-ignore-next-line');

      expect(declinesFinding(lines, 1)).toBe(false);
    });
  });

  describe('given a tail after the token', () => {
    it('accepts a reason', () => {
      const lines = linesOf('error instanceof Error; // rdy-ignore -- the bootstrap shim, no deps allowed');

      expect(declinesFinding(lines, 1)).toBe(true);
    });

    it('accepts check ids, which narrow nothing', () => {
      const lines = linesOf('error instanceof Error; // rdy-ignore toolbelt.errors/no-instanceof-error');

      expect(declinesFinding(lines, 1)).toBe(true);
    });

    it('accepts check ids followed by a reason', () => {
      const lines = linesOf('// rdy-ignore-next-line toolbelt.errors/no-instanceof-error, x/y -- the shim\nerror;');

      expect(declinesFinding(lines, 2)).toBe(true);
    });
  });

  describe('given a token the grammar does not name', () => {
    it('declines nothing for a word the token only prefixes', () => {
      const lines = linesOf('const rdy-ignored = 1;');

      expect(declinesFinding(lines, 1)).toBe(false);
    });

    it('declines nothing for a misspelt next-line suffix', () => {
      const lines = linesOf('// rdy-ignore-nextline\nerror instanceof Error;');

      expect(declinesFinding(lines, 1)).toBe(false);
      expect(declinesFinding(lines, 2)).toBe(false);
    });

    it('declines nothing for a token a longer word ends with', () => {
      const lines = linesOf('const notrdy-ignore = 1;');

      expect(declinesFinding(lines, 1)).toBe(false);
    });
  });

  it('reads a pragma a block comment closes against without a space', () => {
    const lines = linesOf('error instanceof Error; /*rdy-ignore*/');

    expect(declinesFinding(lines, 1)).toBe(true);
  });

  it('answers for each scope where one line carries both tokens', () => {
    const lines = linesOf('// rdy-ignore rdy-ignore-next-line\nerror;');

    expect(declinesFinding(lines, 1)).toBe(true);
    expect(declinesFinding(lines, 2)).toBe(true);
  });

  it('declines nothing where no line carries a pragma', () => {
    const lines = linesOf('const a = 1;\nerror instanceof Error;');

    expect(declinesFinding(lines, 2)).toBe(false);
  });
});

// region | Helpers

/** Parts a source into the lines `declinesFinding` reads. */
function linesOf(source: string): readonly string[] {
  return source.split('\n');
}

// endregion | Helpers
