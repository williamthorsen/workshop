import { createTempTree, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { listUnusedPragmaWarnings } from '../pragma-report.ts';
import { createPragmaLedger, type PragmaLedger } from '../PragmaLedger.ts';
import { resolveCheckIds } from '../resolveCheckIds.ts';

const REMEDY = 'Remove the pragma, or run the kit whose check it was written for.';

const ID_FORM_REMEDY = `Name a check by the id printed beside its findings, such as \`<package>/<id>\`; or remove the pragma, or run the kit whose check it was written for.`;

const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'rdy-pragma-report-' })),
);

describe('pragma-report.ts', () => {
  it.aroundEach(async (runTest, { temp }) => {
    using _cwd = pointCwdAt(temp.dir);

    await runTest();
  });

  describe(listUnusedPragmaWarnings, () => {
    it('raises a warning naming the pragma, its path, and its line', ({ temp }) => {
      temp.write('src/a.ts', ['x;', 'y;', '// rdy-ignore-next-line', 'z;', ''].join('\n'));
      const ledger = buildScannedLedger(['src/a.ts']);

      const warnings = listUnusedPragmaWarnings(ledger);

      expect(warnings).toStrictEqual([
        {
          code: 'pragma-unused',
          message: '`rdy-ignore-next-line` pragma at src/a.ts:3 suppressed no finding in this run.',
          remedy: REMEDY,
        },
      ]);
    });

    it('stays silent about a pragma whose covered line was suppressed by a check', ({ temp }) => {
      temp.write('src/a.ts', ['x; // rdy-ignore', ''].join('\n'));
      const ledger = buildScannedLedger(['src/a.ts']);
      ledger.recordSuppressed('src/a.ts', 1);

      expect(listUnusedPragmaWarnings(ledger)).toStrictEqual([]);
    });

    it('stays silent about a pragma in a file examined by no check', ({ temp }) => {
      temp.write('src/a.ts', ['x; // rdy-ignore', ''].join('\n'));

      expect(listUnusedPragmaWarnings(createPragmaLedger())).toStrictEqual([]);
    });

    it('raises one warning for a file that two checks both examined', ({ temp }) => {
      temp.write('src/a.ts', ['x; // rdy-ignore', ''].join('\n'));
      const ledger = createPragmaLedger();
      ledger.recordScanned(['src/a.ts']);
      ledger.recordScanned([temp.resolve('src/a.ts')]);

      expect(listUnusedPragmaWarnings(ledger)).toHaveLength(1);
    });

    it('matches a suppressed site declared in absolute form against a relative examined path', ({ temp }) => {
      temp.write('src/a.ts', ['x; // rdy-ignore', ''].join('\n'));
      const ledger = buildScannedLedger(['src/a.ts']);
      ledger.recordSuppressed(temp.resolve('src/a.ts'), 1);

      expect(listUnusedPragmaWarnings(ledger)).toStrictEqual([]);
    });

    it('reads and prints an examined path that a check declared in absolute form', ({ temp }) => {
      temp.write('src/a.ts', ['x; // rdy-ignore', ''].join('\n'));

      const warnings = listUnusedPragmaWarnings(buildScannedLedger([temp.resolve('src/a.ts')]));

      expect(warnings.map((warning) => warning.message)).toStrictEqual([
        '`rdy-ignore` pragma at src/a.ts:1 suppressed no finding in this run.',
      ]);
    });

    it('passes over an examined path outside the JS family', ({ temp }) => {
      temp.write('docs/guide.md', ['<!-- rdy-ignore -->', ''].join('\n'));

      expect(listUnusedPragmaWarnings(buildScannedLedger(['docs/guide.md']))).toStrictEqual([]);
    });

    it('passes over an examined path that cannot be read', () => {
      expect(listUnusedPragmaWarnings(buildScannedLedger(['src/gone.ts']))).toStrictEqual([]);
    });

    it('orders the warnings by path, then by line', ({ temp }) => {
      temp.write('src/b.ts', ['// rdy-ignore', ''].join('\n'));
      temp.write('src/a.ts', ['// rdy-ignore', 'x;', '// rdy-ignore', ''].join('\n'));

      const warnings = listUnusedPragmaWarnings(buildScannedLedger(['src/b.ts', 'src/a.ts']));

      expect(warnings.map((warning) => warning.message)).toStrictEqual([
        '`rdy-ignore` pragma at src/a.ts:1 suppressed no finding in this run.',
        '`rdy-ignore` pragma at src/a.ts:3 suppressed no finding in this run.',
        '`rdy-ignore` pragma at src/b.ts:1 suppressed no finding in this run.',
      ]);
    });

    it('stays silent about a token that the comment rule does not recognize as a site', ({ temp }) => {
      temp.write('src/a.ts', ["const token = 'rdy-ignore';", ''].join('\n'));

      expect(listUnusedPragmaWarnings(buildScannedLedger(['src/a.ts']))).toStrictEqual([]);
    });
  });

  describe('given an unused pragma naming checks', () => {
    it('names a bare id and the printed form of the check that declares it', ({ temp }) => {
      temp.write('src/a.ts', ['x; // rdy-ignore no-instanceof-error', ''].join('\n'));
      const ledger = buildScannedLedger(['src/a.ts']);
      loadChecks(ledger, 'toolbelt.errors', 'no-instanceof-error');

      const warnings = listUnusedPragmaWarnings(ledger);

      expect(warnings).toStrictEqual([
        {
          code: 'pragma-unused',
          message:
            '`rdy-ignore` pragma at src/a.ts:1 suppressed no finding in this run; it names `no-instanceof-error`, which matches no check in it.',
          remedy: 'Write `no-instanceof-error` as `toolbelt.errors/no-instanceof-error`.',
        },
      ]);
    });

    it('gives the general id form for an id that no check in the run declares', ({ temp }) => {
      temp.write('src/a.ts', ['x; // rdy-ignore no-such-check', ''].join('\n'));
      const ledger = buildScannedLedger(['src/a.ts']);
      loadChecks(ledger, 'toolbelt.errors', 'no-instanceof-error');

      expect(listUnusedPragmaWarnings(ledger)[0]?.remedy).toBe(ID_FORM_REMEDY);
    });

    it('names every unmatched id, suggesting a form where one is known', ({ temp }) => {
      temp.write('src/a.ts', ['x; // rdy-ignore no-instanceof-error, no-such-check', ''].join('\n'));
      const ledger = buildScannedLedger(['src/a.ts']);
      loadChecks(ledger, 'toolbelt.errors', 'no-instanceof-error');

      const [warning] = listUnusedPragmaWarnings(ledger);

      expect(warning?.message).toBe(
        '`rdy-ignore` pragma at src/a.ts:1 suppressed no finding in this run; it names `no-instanceof-error`, `no-such-check`, which match no check in it.',
      );
      expect(warning?.remedy).toBe(
        `Write \`no-instanceof-error\` as \`toolbelt.errors/no-instanceof-error\`. ${ID_FORM_REMEDY}`,
      );
    });

    it('offers each printed form when two kits declare the same id', ({ temp }) => {
      temp.write('src/a.ts', ['x; // rdy-ignore shared', ''].join('\n'));
      const ledger = buildScannedLedger(['src/a.ts']);
      loadChecks(ledger, 'kit-a', 'shared');
      loadChecks(ledger, 'kit-b', 'shared');

      expect(listUnusedPragmaWarnings(ledger)[0]?.remedy).toBe('Write `shared` as `kit-a/shared` or `kit-b/shared`.');
    });

    it('names only the unmatched id of a pragma that also names a check of the run', ({ temp }) => {
      temp.write('src/a.ts', ['x; // rdy-ignore toolbelt.errors/no-instanceof-error, no-such-check', ''].join('\n'));
      const ledger = buildScannedLedger(['src/a.ts']);
      loadChecks(ledger, 'toolbelt.errors', 'no-instanceof-error');

      expect(listUnusedPragmaWarnings(ledger)[0]?.message).toBe(
        '`rdy-ignore` pragma at src/a.ts:1 suppressed no finding in this run; it names `no-such-check`, which matches no check in it.',
      );
    });

    it('keeps the generic warning when every id names a check of the run', ({ temp }) => {
      temp.write('src/a.ts', ['x; // rdy-ignore toolbelt.errors/no-instanceof-error', ''].join('\n'));
      const ledger = buildScannedLedger(['src/a.ts']);
      loadChecks(ledger, 'toolbelt.errors', 'no-instanceof-error');

      expect(listUnusedPragmaWarnings(ledger)).toStrictEqual([
        {
          code: 'pragma-unused',
          message: '`rdy-ignore` pragma at src/a.ts:1 suppressed no finding in this run.',
          remedy: REMEDY,
        },
      ]);
    });
  });
});

// region | Helpers

/** Opens a ledger recording the given paths as examined and nothing as suppressed. */
function buildScannedLedger(paths: readonly string[]): PragmaLedger {
  const ledger = createPragmaLedger();
  ledger.recordScanned(paths);
  return ledger;
}

/** Records a check of a kit published by the named package as loaded. */
function loadChecks(ledger: PragmaLedger, packageName: string, id: string): void {
  const ids = resolveCheckIds(id, { kind: 'package', packageName, source: `npm:${packageName}`, version: '1.0.0' });
  if (ids !== undefined) ledger.recordCheckIds(ids);
}

// endregion | Helpers
