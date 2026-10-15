import { captureStdio, createTempTree, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { warnOnUnusedPragmas } from '../pragma-report.ts';
import { createPragmaLedger, type PragmaLedger } from '../PragmaLedger.ts';
import { resolveCheckIds } from '../resolveCheckIds.ts';

const REMEDY = 'Remove the pragma, or run the kit whose check it was written for.';

const ID_FORM_REMEDY = `Name a check by the id printed beside its findings, such as \`<package>/<id>\`; or remove the pragma, or run the kit whose check it was written for.`;

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'rdy-pragma-report-' })),
);

it.aroundEach(async (runTest, { temp }) => {
  using _cwd = pointCwdAt(temp.dir);

  await runTest();
});

describe(warnOnUnusedPragmas, () => {
  it('raises a warning naming the pragma, its path, and its line', ({ temp }) => {
    temp.write('src/a.ts', ['x;', 'y;', '// rdy-ignore-next-line', 'z;', ''].join('\n'));
    const ledger = scanning(['src/a.ts']);

    const { warnings, stderr } = warn(ledger);

    expect(warnings).toStrictEqual([
      {
        code: 'pragma-unused',
        message: '`rdy-ignore-next-line` pragma at src/a.ts:3 suppressed no finding in this run.',
        remedy: REMEDY,
      },
    ]);
    expect(stderr).toBe(
      `Warning: \`rdy-ignore-next-line\` pragma at src/a.ts:3 suppressed no finding in this run. ${REMEDY}\n`,
    );
  });

  it('stays silent about a pragma whose covered line was suppressed by a check', ({ temp }) => {
    temp.write('src/a.ts', ['x; // rdy-ignore', ''].join('\n'));
    const ledger = scanning(['src/a.ts']);
    ledger.recordSuppressed('src/a.ts', 1);

    expect(warn(ledger).warnings).toStrictEqual([]);
  });

  it('stays silent about a pragma in a file examined by no check', ({ temp }) => {
    temp.write('src/a.ts', ['x; // rdy-ignore', ''].join('\n'));

    expect(warn(createPragmaLedger()).warnings).toStrictEqual([]);
  });

  it('raises one warning for a file that two checks both examined', ({ temp }) => {
    temp.write('src/a.ts', ['x; // rdy-ignore', ''].join('\n'));
    const ledger = createPragmaLedger();
    ledger.recordScanned(['src/a.ts']);
    ledger.recordScanned([temp.resolve('src/a.ts')]);

    expect(warn(ledger).warnings).toHaveLength(1);
  });

  it('matches a suppressed site declared in absolute form against a relative examined path', ({ temp }) => {
    temp.write('src/a.ts', ['x; // rdy-ignore', ''].join('\n'));
    const ledger = scanning(['src/a.ts']);
    ledger.recordSuppressed(temp.resolve('src/a.ts'), 1);

    expect(warn(ledger).warnings).toStrictEqual([]);
  });

  it('reads and prints an examined path that a check declared in absolute form', ({ temp }) => {
    temp.write('src/a.ts', ['x; // rdy-ignore', ''].join('\n'));

    const { warnings } = warn(scanning([temp.resolve('src/a.ts')]));

    expect(warnings.map((warning) => warning.message)).toStrictEqual([
      '`rdy-ignore` pragma at src/a.ts:1 suppressed no finding in this run.',
    ]);
  });

  it('passes over an examined path outside the JS family', ({ temp }) => {
    temp.write('docs/guide.md', ['<!-- rdy-ignore -->', ''].join('\n'));

    expect(warn(scanning(['docs/guide.md'])).warnings).toStrictEqual([]);
  });

  it('passes over an examined path that cannot be read', () => {
    expect(warn(scanning(['src/gone.ts'])).warnings).toStrictEqual([]);
  });

  it('orders the warnings by path, then by line', ({ temp }) => {
    temp.write('src/b.ts', ['// rdy-ignore', ''].join('\n'));
    temp.write('src/a.ts', ['// rdy-ignore', 'x;', '// rdy-ignore', ''].join('\n'));

    const { warnings } = warn(scanning(['src/b.ts', 'src/a.ts']));

    expect(warnings.map((warning) => warning.message)).toStrictEqual([
      '`rdy-ignore` pragma at src/a.ts:1 suppressed no finding in this run.',
      '`rdy-ignore` pragma at src/a.ts:3 suppressed no finding in this run.',
      '`rdy-ignore` pragma at src/b.ts:1 suppressed no finding in this run.',
    ]);
  });

  it('stays silent about a token that the comment rule does not recognize as a site', ({ temp }) => {
    temp.write('src/a.ts', ["const token = 'rdy-ignore';", ''].join('\n'));

    expect(warn(scanning(['src/a.ts'])).warnings).toStrictEqual([]);
  });
});

describe('given an unused pragma naming checks', () => {
  it('names a bare id and the printed form of the check that declares it', ({ temp }) => {
    temp.write('src/a.ts', ['x; // rdy-ignore no-instanceof-error', ''].join('\n'));
    const ledger = scanning(['src/a.ts']);
    loadChecks(ledger, 'toolbelt.errors', 'no-instanceof-error');

    const { warnings, stderr } = warn(ledger);

    expect(warnings).toStrictEqual([
      {
        code: 'pragma-unused',
        message:
          '`rdy-ignore` pragma at src/a.ts:1 suppressed no finding in this run; it names `no-instanceof-error`, which matches no check in it.',
        remedy: 'Write `no-instanceof-error` as `toolbelt.errors/no-instanceof-error`.',
      },
    ]);
    expect(stderr).toBe(`Warning: ${warnings[0]?.message} ${warnings[0]?.remedy}\n`);
  });

  it('gives the general id form for an id that no check in the run declares', ({ temp }) => {
    temp.write('src/a.ts', ['x; // rdy-ignore no-such-check', ''].join('\n'));
    const ledger = scanning(['src/a.ts']);
    loadChecks(ledger, 'toolbelt.errors', 'no-instanceof-error');

    expect(warn(ledger).warnings[0]?.remedy).toBe(ID_FORM_REMEDY);
  });

  it('names every unmatched id, suggesting a form where one is known', ({ temp }) => {
    temp.write('src/a.ts', ['x; // rdy-ignore no-instanceof-error, no-such-check', ''].join('\n'));
    const ledger = scanning(['src/a.ts']);
    loadChecks(ledger, 'toolbelt.errors', 'no-instanceof-error');

    const [warning] = warn(ledger).warnings;

    expect(warning?.message).toBe(
      '`rdy-ignore` pragma at src/a.ts:1 suppressed no finding in this run; it names `no-instanceof-error`, `no-such-check`, which match no check in it.',
    );
    expect(warning?.remedy).toBe(
      `Write \`no-instanceof-error\` as \`toolbelt.errors/no-instanceof-error\`. ${ID_FORM_REMEDY}`,
    );
  });

  it('offers each printed form when two kits declare the same id', ({ temp }) => {
    temp.write('src/a.ts', ['x; // rdy-ignore shared', ''].join('\n'));
    const ledger = scanning(['src/a.ts']);
    loadChecks(ledger, 'kit-a', 'shared');
    loadChecks(ledger, 'kit-b', 'shared');

    expect(warn(ledger).warnings[0]?.remedy).toBe('Write `shared` as `kit-a/shared` or `kit-b/shared`.');
  });

  it('names only the unmatched id of a pragma that also names a check of the run', ({ temp }) => {
    temp.write('src/a.ts', ['x; // rdy-ignore toolbelt.errors/no-instanceof-error, no-such-check', ''].join('\n'));
    const ledger = scanning(['src/a.ts']);
    loadChecks(ledger, 'toolbelt.errors', 'no-instanceof-error');

    expect(warn(ledger).warnings[0]?.message).toBe(
      '`rdy-ignore` pragma at src/a.ts:1 suppressed no finding in this run; it names `no-such-check`, which matches no check in it.',
    );
  });

  it('keeps the generic warning when every id names a check of the run', ({ temp }) => {
    temp.write('src/a.ts', ['x; // rdy-ignore toolbelt.errors/no-instanceof-error', ''].join('\n'));
    const ledger = scanning(['src/a.ts']);
    loadChecks(ledger, 'toolbelt.errors', 'no-instanceof-error');

    expect(warn(ledger).warnings).toStrictEqual([
      {
        code: 'pragma-unused',
        message: '`rdy-ignore` pragma at src/a.ts:1 suppressed no finding in this run.',
        remedy: REMEDY,
      },
    ]);
  });
});

// region | Helpers

/** Records a check of a kit published by the named package as loaded. */
function loadChecks(ledger: PragmaLedger, packageName: string, id: string): void {
  const ids = resolveCheckIds(id, { kind: 'package', packageName, source: `npm:${packageName}`, version: '1.0.0' });
  if (ids !== undefined) ledger.recordCheckIds(ids);
}

/** Opens a ledger recording the given paths as examined and nothing as suppressed. */
function scanning(paths: readonly string[]): PragmaLedger {
  const ledger = createPragmaLedger();
  ledger.recordScanned(paths);
  return ledger;
}

/** Reports over one ledger, returning the warnings alongside everything that the call wrote. */
function warn(ledger: PragmaLedger) {
  using io = captureStdio();

  const warnings = warnOnUnusedPragmas(ledger);

  return { warnings, stderr: io.stderr };
}

// endregion | Helpers
