import { describe, expect, it } from 'vitest';

import { declinesFinding } from '../declinesFinding.ts';

const NAMED = ['toolbelt.errors/no-instanceof-error'];

describe(declinesFinding, () => {
  describe('given an `rdy-ignore`', () => {
    it('declines a finding on the line it sits on', () => {
      const lines = linesOf('const a = 1;\nerror instanceof Error; // rdy-ignore\nconst b = 2;');

      expect(declinesFinding(lines, 2, [])).toBe(true);
    });

    it('declines nothing on the line below it', () => {
      const lines = linesOf('// rdy-ignore\nerror instanceof Error;');

      expect(declinesFinding(lines, 2, [])).toBe(false);
    });

    it('declines a finding on the first line', () => {
      const lines = linesOf('error instanceof Error; // rdy-ignore');

      expect(declinesFinding(lines, 1, [])).toBe(true);
    });
  });

  describe('given an `rdy-ignore-next-line`', () => {
    it('declines a finding on the line below it', () => {
      const lines = linesOf('// rdy-ignore-next-line\nerror instanceof Error;');

      expect(declinesFinding(lines, 2, [])).toBe(true);
    });

    it('declines nothing on the line it sits on', () => {
      const lines = linesOf('error instanceof Error; // rdy-ignore-next-line');

      expect(declinesFinding(lines, 1, [])).toBe(false);
    });
  });

  describe('given a pragma naming no check', () => {
    it('declines whatever ids the check carries', () => {
      const lines = linesOf('error instanceof Error; // rdy-ignore');

      expect(declinesFinding(lines, 1, NAMED)).toBe(true);
    });

    it('accepts a reason, which names no check', () => {
      const lines = linesOf('error instanceof Error; // rdy-ignore -- the bootstrap shim, no deps allowed');

      expect(declinesFinding(lines, 1, NAMED)).toBe(true);
    });
  });

  describe('given a pragma naming checks', () => {
    it('declines for a check it names', () => {
      const lines = linesOf('error instanceof Error; // rdy-ignore toolbelt.errors/no-instanceof-error');

      expect(declinesFinding(lines, 1, NAMED)).toBe(true);
    });

    it('declines nothing for a check it does not name', () => {
      const lines = linesOf('error instanceof Error; // rdy-ignore toolbelt.errors/other-check');

      expect(declinesFinding(lines, 1, NAMED)).toBe(false);
    });

    it('declines nothing for a check carrying no id at all', () => {
      const lines = linesOf('error instanceof Error; // rdy-ignore toolbelt.errors/no-instanceof-error');

      expect(declinesFinding(lines, 1, [])).toBe(false);
    });

    it('declines where it names either form the check accepts', () => {
      const accepted = ['toolbelt.errors/no-instanceof-error', '@williamthorsen/toolbelt.errors/no-instanceof-error'];
      const lines = linesOf(
        'error instanceof Error; // rdy-ignore @williamthorsen/toolbelt.errors/no-instanceof-error',
      );

      expect(declinesFinding(lines, 1, accepted)).toBe(true);
    });

    it('declines for any check a comma-separated list names', () => {
      const lines = linesOf('error instanceof Error; // rdy-ignore x/y,toolbelt.errors/no-instanceof-error');

      expect(declinesFinding(lines, 1, NAMED)).toBe(true);
    });

    it('reads a list spaced around its commas', () => {
      const lines = linesOf('error instanceof Error; // rdy-ignore x/y , toolbelt.errors/no-instanceof-error , z');

      expect(declinesFinding(lines, 1, NAMED)).toBe(true);
    });

    it('declines nothing where the named check belongs to another kit', () => {
      const lines = linesOf('error instanceof Error; // rdy-ignore other.kit/no-instanceof-error');

      expect(declinesFinding(lines, 1, NAMED)).toBe(false);
    });

    it('narrows the pragma covering the line below it', () => {
      const lines = linesOf('// rdy-ignore-next-line toolbelt.errors/other-check\nerror instanceof Error;');

      expect(declinesFinding(lines, 2, NAMED)).toBe(false);
    });
  });

  describe('given a tail the id list ends against', () => {
    it('ends at a reason', () => {
      const lines = linesOf('// rdy-ignore-next-line toolbelt.errors/no-instanceof-error -- the shim\nerror;');

      expect(declinesFinding(lines, 2, NAMED)).toBe(true);
    });

    it('ends at the delimiter closing a block comment', () => {
      const lines = linesOf('error instanceof Error; /* rdy-ignore toolbelt.errors/no-instanceof-error */');

      expect(declinesFinding(lines, 1, NAMED)).toBe(true);
    });

    it('ends at a second pragma token rather than reading it as an id', () => {
      const lines = linesOf('// rdy-ignore rdy-ignore-next-line\nerror;');

      expect(declinesFinding(lines, 1, NAMED)).toBe(true);
      expect(declinesFinding(lines, 2, NAMED)).toBe(true);
    });
  });

  describe('given a token the grammar does not name', () => {
    it('declines nothing for a word the token only prefixes', () => {
      const lines = linesOf('const rdy-ignored = 1;');

      expect(declinesFinding(lines, 1, [])).toBe(false);
    });

    it('declines nothing for a misspelt next-line suffix', () => {
      const lines = linesOf('// rdy-ignore-nextline\nerror instanceof Error;');

      expect(declinesFinding(lines, 1, [])).toBe(false);
      expect(declinesFinding(lines, 2, [])).toBe(false);
    });

    it('declines nothing for a token a longer word ends with', () => {
      const lines = linesOf('const notrdy-ignore = 1;');

      expect(declinesFinding(lines, 1, [])).toBe(false);
    });
  });

  it('reads a pragma a block comment closes against without a space', () => {
    const lines = linesOf('error instanceof Error; /*rdy-ignore*/');

    expect(declinesFinding(lines, 1, [])).toBe(true);
  });

  it('answers for each scope where one line carries both tokens', () => {
    const lines = linesOf('// rdy-ignore rdy-ignore-next-line\nerror;');

    expect(declinesFinding(lines, 1, [])).toBe(true);
    expect(declinesFinding(lines, 2, [])).toBe(true);
  });

  it('declines nothing where no line carries a pragma', () => {
    const lines = linesOf('const a = 1;\nerror instanceof Error;');

    expect(declinesFinding(lines, 2, [])).toBe(false);
  });
});

// region | Helpers

/** Parts a source into the lines `declinesFinding` reads. */
function linesOf(source: string): readonly string[] {
  return source.split('\n');
}

// endregion | Helpers
