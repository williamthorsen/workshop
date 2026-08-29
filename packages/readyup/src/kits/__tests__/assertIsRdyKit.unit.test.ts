import { captureError } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { assertIsRdyKit } from '../assertIsRdyKit.ts';

/** Runs the assertion and returns the message it threw, failing the test when it accepted the value. */
async function messageFrom(raw: unknown, source?: string): Promise<string> {
  return (await captureError(() => assertIsRdyKit(raw, source))).message;
}

describe(assertIsRdyKit, () => {
  describe('kit shape', () => {
    it('throws when input is not an object', () => {
      expect(() => assertIsRdyKit('string')).toThrow('Invalid kit');
    });

    it('throws when input is an array', () => {
      expect(() => assertIsRdyKit([])).toThrow('Invalid kit');
    });

    it('throws when checklists is missing', async () => {
      await expect(messageFrom({})).resolves.toContain('checklists:');
    });

    it('throws when a checklist has neither checks nor groups', async () => {
      await expect(messageFrom({ checklists: [{ name: 'bad' }] })).resolves.toContain(
        "checklists[0]: Checklist must have either 'checks' or 'groups'",
      );
    });

    it('throws when a checklist has both checks and groups', async () => {
      await expect(messageFrom({ checklists: [{ name: 'bad', checks: [], groups: [] }] })).resolves.toContain(
        "checklists[0]: Checklist cannot have both 'checks' and 'groups'",
      );
    });

    // `isFlatChecklist` discriminates on key presence, so a checklist with either key explicitly
    // set to `undefined` is classified by that key whatever its value, and the collection the runner
    // then iterates is not there.
    it.each([
      ['checks is undefined beside a populated groups', { name: 'bad', checks: undefined, groups: [[]] }],
      ['groups is undefined beside a populated checks', { name: 'bad', checks: [], groups: undefined }],
    ])('rejects a checklist where %s', async (_label, checklist) => {
      await expect(messageFrom({ checklists: [checklist] })).resolves.toContain(
        "checklists[0]: Checklist cannot have both 'checks' and 'groups'",
      );
    });

    it('throws when the only collection a checklist declares is undefined', async () => {
      await expect(messageFrom({ checklists: [{ name: 'bad', checks: undefined }] })).resolves.toContain(
        "checklists[0]: Checklist must have either 'checks' or 'groups'",
      );
    });

    it('throws when a checklist entry is not an object', async () => {
      await expect(messageFrom({ checklists: ['not-an-object'] })).resolves.toContain('checklists[0]:');
    });

    it('throws when a checklist name is missing', async () => {
      await expect(messageFrom({ checklists: [{ checks: [] }] })).resolves.toContain(
        'checklists[0].name: expected a non-empty string',
      );
    });

    it('throws when a checklist name is empty', async () => {
      await expect(messageFrom({ checklists: [{ name: '', checks: [] }] })).resolves.toContain(
        'checklists[0].name: expected a non-empty string',
      );
    });

    it('throws when a checklist fixLocation is invalid', async () => {
      await expect(
        messageFrom({ checklists: [{ name: 'test', checks: [], fixLocation: 'INLINE' }] }),
      ).resolves.toContain('checklists[0].fixLocation: expected one of "inline", "end", got "INLINE"');
    });
  });

  describe('check validation', () => {
    it("throws when a flat check has a typo'd severity", async () => {
      const raw = { checklists: [{ name: 'test', checks: [{ name: 'a', check: () => true, severity: 'info' }] }] };

      await expect(messageFrom(raw)).resolves.toContain(
        'checklists[0].checks[0].severity: expected one of "error", "warn", "recommend", got "info"',
      );
    });

    it('throws when a check name is missing', async () => {
      const raw = { checklists: [{ name: 'test', checks: [{ check: () => true }] }] };

      await expect(messageFrom(raw)).resolves.toContain('checklists[0].checks[0].name: expected a non-empty string');
    });

    it('throws when a check name is empty', async () => {
      const raw = { checklists: [{ name: 'test', checks: [{ name: '', check: () => true }] }] };

      await expect(messageFrom(raw)).resolves.toContain('checklists[0].checks[0].name: expected a non-empty string');
    });

    it('names the type supplied when check is not a function', async () => {
      const raw = { checklists: [{ name: 'test', checks: [{ name: 'a', check: 'nope' }] }] };

      await expect(messageFrom(raw)).resolves.toContain(
        'checklists[0].checks[0].check: expected a function, got string',
      );
    });

    it('names the type supplied when check is null', async () => {
      const raw = { checklists: [{ name: 'test', checks: [{ name: 'a', check: null }] }] };

      await expect(messageFrom(raw)).resolves.toContain('checklists[0].checks[0].check: expected a function, got null');
    });

    it('throws when skip is not a function', async () => {
      const raw = { checklists: [{ name: 'test', checks: [{ name: 'a', check: () => true, skip: true }] }] };

      await expect(messageFrom(raw)).resolves.toContain(
        'checklists[0].checks[0].skip: expected a function, got boolean',
      );
    });

    it('throws when fix is not a string', async () => {
      const raw = { checklists: [{ name: 'test', checks: [{ name: 'a', check: () => true, fix: 42 }] }] };

      await expect(messageFrom(raw)).resolves.toContain('checklists[0].checks[0].fix:');
    });

    it('throws when id is not a string', async () => {
      const raw = { checklists: [{ name: 'test', checks: [{ name: 'a', check: () => true, id: 42 }] }] };

      await expect(messageFrom(raw)).resolves.toContain('checklists[0].checks[0].id:');
    });

    it('throws when id is empty', async () => {
      const raw = { checklists: [{ name: 'test', checks: [{ name: 'a', check: () => true, id: '' }] }] };

      await expect(messageFrom(raw)).resolves.toContain('checklists[0].checks[0].id: expected a non-empty string');
    });

    it('throws when quiet is not a boolean', async () => {
      const raw = { checklists: [{ name: 'test', checks: [{ name: 'a', check: () => true, quiet: 'true' }] }] };

      await expect(messageFrom(raw)).resolves.toContain('checklists[0].checks[0].quiet:');
    });

    it('locates a bad quiet on a check nested under a parent', async () => {
      const raw = {
        checklists: [
          {
            name: 'test',
            checks: [{ name: 'parent', check: () => true, checks: [{ name: 'child', check: () => true, quiet: 1 }] }],
          },
        ],
      };

      await expect(messageFrom(raw)).resolves.toContain('checklists[0].checks[0].checks[0].quiet:');
    });

    it('validates checks nested under a parent check', async () => {
      const raw = {
        checklists: [
          {
            name: 'test',
            checks: [{ name: 'parent', check: () => true, checks: [{ name: 'child', check: 'nope' }] }],
          },
        ],
      };

      await expect(messageFrom(raw)).resolves.toContain(
        'checklists[0].checks[0].checks[0].check: expected a function, got string',
      );
    });

    it('validates checks inside a staged checklist group', async () => {
      const raw = { checklists: [{ name: 'test', groups: [[{ name: 'a', check: () => true }], [{ name: 'b' }]] }] };

      await expect(messageFrom(raw)).resolves.toContain(
        'checklists[0].groups[1][0].check: expected a function, got undefined',
      );
    });

    it('validates preconditions', async () => {
      const raw = {
        checklists: [
          { name: 'test', preconditions: [{ name: 'gate', check: () => true, severity: 'blocker' }], checks: [] },
        ],
      };

      await expect(messageFrom(raw)).resolves.toContain('checklists[0].preconditions[0].severity:');
    });

    it('reports every offending check, not only the first', async () => {
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
      const message = await messageFrom(raw);

      expect(message).toContain('checklists[0].checks[0].check:');
      expect(message).toContain('checklists[0].checks[1].name:');
    });
  });

  describe('accessor-valued fix', () => {
    it('leaves a fix accessor uninvoked', () => {
      let hits = 0;
      const raw = {
        checklists: [
          {
            name: 'test',
            checks: [
              {
                name: 'a',
                check: () => true,
                get fix() {
                  hits++;
                  return 'Run the thing';
                },
              },
            ],
          },
        ],
      };

      assertIsRdyKit(raw);

      expect(hits).toBe(0);
    });

    it('leaves a fix accessor uninvoked on a check nested under a parent', () => {
      let hits = 0;
      const raw = {
        checklists: [
          {
            name: 'test',
            checks: [
              {
                name: 'parent',
                check: () => true,
                checks: [
                  {
                    name: 'child',
                    check: () => true,
                    get fix() {
                      hits++;
                      return 'Run the thing';
                    },
                  },
                ],
              },
            ],
          },
        ],
      };

      assertIsRdyKit(raw);

      expect(hits).toBe(0);
    });

    it('accepts a kit whose fix accessor throws', () => {
      const raw = {
        checklists: [
          {
            name: 'test',
            checks: [
              {
                name: 'a',
                check: () => true,
                get fix(): string {
                  throw new Error('resolved too early');
                },
              },
            ],
          },
        ],
      };

      expect(() => assertIsRdyKit(raw)).not.toThrow();
    });

    // Hiding `fix` from the parse must not hide the check's other accessors, which the runner needs
    // resolved for every result and every tree.
    it('still invokes a name accessor on a check whose fix is an accessor', () => {
      let hits = 0;
      const raw = {
        checklists: [
          {
            name: 'test',
            checks: [
              {
                get name() {
                  hits++;
                  return 'a';
                },
                check: () => true,
                get fix() {
                  return 'Run the thing';
                },
              },
            ],
          },
        ],
      };

      assertIsRdyKit(raw);

      expect(hits).toBeGreaterThan(0);
    });
  });

  describe('error message', () => {
    it('names the kit source when one is supplied', async () => {
      const message = await messageFrom({}, '.readyup/kits/default.js');

      expect(message).toContain('Invalid kit at .readyup/kits/default.js:');
    });

    it('omits the location clause when no source is supplied', async () => {
      await expect(messageFrom({})).resolves.toContain('Invalid kit:');
    });

    it('does not expose raw Zod output', async () => {
      const message = await messageFrom({ checklists: [{ name: 'test', checks: [{ name: 'a', check: 'nope' }] }] });

      expect(message).not.toContain('"code"');
      expect(message).not.toContain('invalid_type');
    });

    it('locates an issue on the kit itself at the root', async () => {
      await expect(messageFrom('string')).resolves.toContain('(kit root):');
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

    it('accepts a check with every optional field', () => {
      expect(() =>
        assertIsRdyKit({
          checklists: [
            {
              name: 'test',
              checks: [
                {
                  name: 'a',
                  check: () => true,
                  severity: 'recommend',
                  quiet: true,
                  skip: () => false,
                  fix: 'run it',
                },
              ],
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
    it('throws when suites is not an object', async () => {
      await expect(
        messageFrom({ checklists: [{ name: 'test', checks: [] }], suites: 'not-a-record' }),
      ).resolves.toContain('suites:');
    });

    it('throws when a suite value is not an array', async () => {
      await expect(
        messageFrom({ checklists: [{ name: 'test', checks: [] }], suites: { ci: 'not-an-array' } }),
      ).resolves.toContain('suites.ci:');
    });

    it('throws when a suite contains non-string entries', async () => {
      await expect(
        messageFrom({ checklists: [{ name: 'test', checks: [] }], suites: { ci: [42] } }),
      ).resolves.toContain('suites.ci[0]:');
    });

    it('throws when fixLocation is invalid', async () => {
      await expect(
        messageFrom({ checklists: [{ name: 'test', checks: [] }], fixLocation: 'WRONG' }),
      ).resolves.toContain('fixLocation: expected one of "inline", "end", got "WRONG"');
    });

    it('throws when fixLocation uses old uppercase casing', async () => {
      await expect(
        messageFrom({ checklists: [{ name: 'test', checks: [] }], fixLocation: 'INLINE' }),
      ).resolves.toContain('fixLocation:');
    });

    it('throws when defaultSeverity is invalid', async () => {
      await expect(
        messageFrom({ checklists: [{ name: 'test', checks: [] }], defaultSeverity: 'critical' }),
      ).resolves.toContain('defaultSeverity: expected one of "error", "warn", "recommend", got "critical"');
    });

    it('throws when failOn is invalid', async () => {
      await expect(messageFrom({ checklists: [{ name: 'test', checks: [] }], failOn: 'none' })).resolves.toContain(
        'failOn:',
      );
    });

    it('throws when reportOn is invalid', async () => {
      await expect(messageFrom({ checklists: [{ name: 'test', checks: [] }], reportOn: 'verbose' })).resolves.toContain(
        'reportOn:',
      );
    });

    it.each([
      ['a range prefix', '>=0.33.0'],
      ['a caret prefix', '^0.33.0'],
      ['a prerelease tail', '0.33.0-rc.1'],
      ['a leading v', 'v0.33.0'],
      ['a non-numeric segment', '0.x'],
      ['a fourth segment the comparison would discard', '0.33.0.1'],
      ['an empty string', ''],
    ])('throws when minReadyupVersion carries %s', async (_label, value) => {
      await expect(
        messageFrom({ checklists: [{ name: 'test', checks: [] }], minReadyupVersion: value }),
      ).resolves.toContain('minReadyupVersion: expected a dotted numeric version');
    });

    it('names the type when minReadyupVersion is not a string', async () => {
      await expect(
        messageFrom({ checklists: [{ name: 'test', checks: [] }], minReadyupVersion: 33 }),
      ).resolves.toContain('minReadyupVersion: expected a dotted numeric version, got number');
    });

    it.each([['0.33.0'], ['1'], ['0.33'], ['10.2.1']])('accepts the dotted numeric floor %s', (value) => {
      expect(() =>
        assertIsRdyKit({ checklists: [{ name: 'test', checks: [] }], minReadyupVersion: value }),
      ).not.toThrow();
    });

    it('accepts a kit that declares no floor', () => {
      expect(() => assertIsRdyKit({ checklists: [{ name: 'test', checks: [] }] })).not.toThrow();
    });
  });
});
