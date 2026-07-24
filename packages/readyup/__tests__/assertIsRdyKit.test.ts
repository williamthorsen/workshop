import { describe, expect, it } from 'vitest';

import { assertIsRdyKit } from '../src/assertIsRdyKit.ts';

/** Run the assertion and return the message it threw, failing the test when it accepted the value. */
function messageFrom(raw: unknown, source?: string): string {
  try {
    assertIsRdyKit(raw, source);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return error.message;
  }
  return expect.unreachable('Expected assertIsRdyKit to throw');
}

describe(assertIsRdyKit, () => {
  describe('kit shape', () => {
    it('throws when input is not an object', () => {
      expect(() => assertIsRdyKit('string')).toThrow('Invalid kit');
    });

    it('throws when input is an array', () => {
      expect(() => assertIsRdyKit([])).toThrow('Invalid kit');
    });

    it('throws when checklists is missing', () => {
      expect(messageFrom({})).toContain('checklists:');
    });

    it('throws when a checklist has neither checks nor groups', () => {
      expect(messageFrom({ checklists: [{ name: 'bad' }] })).toContain(
        "checklists[0]: Checklist must have either 'checks' or 'groups'",
      );
    });

    it('throws when a checklist has both checks and groups', () => {
      expect(messageFrom({ checklists: [{ name: 'bad', checks: [], groups: [] }] })).toContain(
        "checklists[0]: Checklist cannot have both 'checks' and 'groups'",
      );
    });

    // `isFlatChecklist` discriminates on key presence, so a checklist carrying either key explicitly
    // set to `undefined` is classified by that key whatever its value, and the collection the runner
    // then iterates is not there.
    it.each([
      ['checks is undefined beside a populated groups', { name: 'bad', checks: undefined, groups: [[]] }],
      ['groups is undefined beside a populated checks', { name: 'bad', checks: [], groups: undefined }],
    ])('rejects a checklist where %s', (_label, checklist) => {
      expect(messageFrom({ checklists: [checklist] })).toContain(
        "checklists[0]: Checklist cannot have both 'checks' and 'groups'",
      );
    });

    it('throws when the only collection a checklist declares is undefined', () => {
      expect(messageFrom({ checklists: [{ name: 'bad', checks: undefined }] })).toContain(
        "checklists[0]: Checklist must have either 'checks' or 'groups'",
      );
    });

    it('throws when a checklist entry is not an object', () => {
      expect(messageFrom({ checklists: ['not-an-object'] })).toContain('checklists[0]:');
    });

    it('throws when a checklist name is missing', () => {
      expect(messageFrom({ checklists: [{ checks: [] }] })).toContain(
        'checklists[0].name: expected a non-empty string',
      );
    });

    it('throws when a checklist name is empty', () => {
      expect(messageFrom({ checklists: [{ name: '', checks: [] }] })).toContain(
        'checklists[0].name: expected a non-empty string',
      );
    });

    it('throws when a checklist fixLocation is invalid', () => {
      expect(messageFrom({ checklists: [{ name: 'test', checks: [], fixLocation: 'INLINE' }] })).toContain(
        'checklists[0].fixLocation: expected one of "inline", "end", got "INLINE"',
      );
    });
  });

  describe('check validation', () => {
    it("throws when a flat check has a typo'd severity", () => {
      const raw = { checklists: [{ name: 'test', checks: [{ name: 'a', check: () => true, severity: 'info' }] }] };

      expect(messageFrom(raw)).toContain(
        'checklists[0].checks[0].severity: expected one of "error", "warn", "recommend", got "info"',
      );
    });

    it('throws when a check name is missing', () => {
      const raw = { checklists: [{ name: 'test', checks: [{ check: () => true }] }] };

      expect(messageFrom(raw)).toContain('checklists[0].checks[0].name: expected a non-empty string');
    });

    it('throws when a check name is empty', () => {
      const raw = { checklists: [{ name: 'test', checks: [{ name: '', check: () => true }] }] };

      expect(messageFrom(raw)).toContain('checklists[0].checks[0].name: expected a non-empty string');
    });

    it('names the type supplied when check is not a function', () => {
      const raw = { checklists: [{ name: 'test', checks: [{ name: 'a', check: 'nope' }] }] };

      expect(messageFrom(raw)).toContain('checklists[0].checks[0].check: expected a function, got string');
    });

    it('names the type supplied when check is null', () => {
      const raw = { checklists: [{ name: 'test', checks: [{ name: 'a', check: null }] }] };

      expect(messageFrom(raw)).toContain('checklists[0].checks[0].check: expected a function, got null');
    });

    it('throws when skip is not a function', () => {
      const raw = { checklists: [{ name: 'test', checks: [{ name: 'a', check: () => true, skip: true }] }] };

      expect(messageFrom(raw)).toContain('checklists[0].checks[0].skip: expected a function, got boolean');
    });

    it('throws when fix is not a string', () => {
      const raw = { checklists: [{ name: 'test', checks: [{ name: 'a', check: () => true, fix: 42 }] }] };

      expect(messageFrom(raw)).toContain('checklists[0].checks[0].fix:');
    });

    it('validates checks nested under a parent check', () => {
      const raw = {
        checklists: [
          {
            name: 'test',
            checks: [{ name: 'parent', check: () => true, checks: [{ name: 'child', check: 'nope' }] }],
          },
        ],
      };

      expect(messageFrom(raw)).toContain('checklists[0].checks[0].checks[0].check: expected a function, got string');
    });

    it('validates checks inside a staged checklist group', () => {
      const raw = { checklists: [{ name: 'test', groups: [[{ name: 'a', check: () => true }], [{ name: 'b' }]] }] };

      expect(messageFrom(raw)).toContain('checklists[0].groups[1][0].check: expected a function, got undefined');
    });

    it('validates preconditions', () => {
      const raw = {
        checklists: [
          { name: 'test', preconditions: [{ name: 'gate', check: () => true, severity: 'blocker' }], checks: [] },
        ],
      };

      expect(messageFrom(raw)).toContain('checklists[0].preconditions[0].severity:');
    });

    it('reports every offending check, not only the first', () => {
      const raw = {
        checklists: [
          {
            name: 'test',
            checks: [
              { name: 'a', check: 'nope' },
              { name: '', check: () => true },
            ],
          },
        ],
      };
      const message = messageFrom(raw);

      expect(message).toContain('checklists[0].checks[0].check:');
      expect(message).toContain('checklists[0].checks[1].name:');
    });
  });

  describe('error message', () => {
    it('names the kit source when one is supplied', () => {
      const message = messageFrom({}, '.readyup/kits/default.js');

      expect(message).toContain('Invalid kit at .readyup/kits/default.js:');
    });

    it('omits the location clause when no source is supplied', () => {
      expect(messageFrom({})).toContain('Invalid kit:');
    });

    it('does not expose raw Zod output', () => {
      const message = messageFrom({ checklists: [{ name: 'test', checks: [{ name: 'a', check: 'nope' }] }] });

      expect(message).not.toContain('"code"');
      expect(message).not.toContain('invalid_type');
    });

    it('locates an issue on the kit itself at the root', () => {
      expect(messageFrom('string')).toContain('(kit root):');
    });
  });

  describe('accepted kits', () => {
    it('accepts a valid kit with flat checklists', () => {
      expect(() =>
        assertIsRdyKit({ checklists: [{ name: 'test', checks: [{ name: 'a', check: () => true }] }] }),
      ).not.toThrow();
    });

    it('accepts a valid kit with staged checklists', () => {
      expect(() =>
        assertIsRdyKit({ checklists: [{ name: 'test', groups: [[{ name: 'a', check: () => true }]] }] }),
      ).not.toThrow();
    });

    it('accepts a checklist with preconditions', () => {
      expect(() =>
        assertIsRdyKit({
          checklists: [
            {
              name: 'test',
              preconditions: [{ name: 'gate', check: () => true, severity: 'warn' }],
              checks: [{ name: 'a', check: () => true }],
            },
          ],
        }),
      ).not.toThrow();
    });

    it('accepts nested checks to arbitrary depth', () => {
      expect(() =>
        assertIsRdyKit({
          checklists: [
            {
              name: 'test',
              checks: [
                {
                  name: 'a',
                  check: () => true,
                  checks: [
                    {
                      name: 'b',
                      check: () => Promise.resolve({ ok: true }),
                      checks: [{ name: 'c', check: () => true }],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      ).not.toThrow();
    });

    it('accepts a check carrying every optional field', () => {
      expect(() =>
        assertIsRdyKit({
          checklists: [
            {
              name: 'test',
              checks: [{ name: 'a', check: () => true, severity: 'recommend', skip: () => false, fix: 'run it' }],
            },
          ],
        }),
      ).not.toThrow();
    });

    it('accepts unknown extra keys on a check', () => {
      expect(() =>
        assertIsRdyKit({ checklists: [{ name: 'test', checks: [{ name: 'a', check: () => true, note: 'why' }] }] }),
      ).not.toThrow();
    });

    it('accepts a valid kit with suites', () => {
      expect(() =>
        assertIsRdyKit({ checklists: [{ name: 'lint', checks: [] }], suites: { ci: ['lint'] } }),
      ).not.toThrow();
    });

    it('accepts a kit without suites', () => {
      expect(() => assertIsRdyKit({ checklists: [{ name: 'test', checks: [] }] })).not.toThrow();
    });

    it('accepts a kit with all optional kit fields', () => {
      expect(() =>
        assertIsRdyKit({
          checklists: [{ name: 'test', checks: [] }],
          defaultSeverity: 'warn',
          failOn: 'warn',
          reportOn: 'recommend',
          fixLocation: 'end',
        }),
      ).not.toThrow();
    });
  });

  describe('kit-level fields', () => {
    it('throws when suites is not an object', () => {
      expect(messageFrom({ checklists: [{ name: 'test', checks: [] }], suites: 'not-a-record' })).toContain('suites:');
    });

    it('throws when a suite value is not an array', () => {
      expect(messageFrom({ checklists: [{ name: 'test', checks: [] }], suites: { ci: 'not-an-array' } })).toContain(
        'suites.ci:',
      );
    });

    it('throws when a suite contains non-string entries', () => {
      expect(messageFrom({ checklists: [{ name: 'test', checks: [] }], suites: { ci: [42] } })).toContain(
        'suites.ci[0]:',
      );
    });

    it('throws when fixLocation is invalid', () => {
      expect(messageFrom({ checklists: [{ name: 'test', checks: [] }], fixLocation: 'WRONG' })).toContain(
        'fixLocation: expected one of "inline", "end", got "WRONG"',
      );
    });

    it('throws when fixLocation uses old uppercase casing', () => {
      expect(messageFrom({ checklists: [{ name: 'test', checks: [] }], fixLocation: 'INLINE' })).toContain(
        'fixLocation:',
      );
    });

    it('throws when defaultSeverity is invalid', () => {
      expect(messageFrom({ checklists: [{ name: 'test', checks: [] }], defaultSeverity: 'critical' })).toContain(
        'defaultSeverity: expected one of "error", "warn", "recommend", got "critical"',
      );
    });

    it('throws when failOn is invalid', () => {
      expect(messageFrom({ checklists: [{ name: 'test', checks: [] }], failOn: 'none' })).toContain('failOn:');
    });

    it('throws when reportOn is invalid', () => {
      expect(messageFrom({ checklists: [{ name: 'test', checks: [] }], reportOn: 'verbose' })).toContain('reportOn:');
    });
  });
});
