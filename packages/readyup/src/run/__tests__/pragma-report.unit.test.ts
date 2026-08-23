import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { captureStdio, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, test } from 'vitest';

import { warnOnUnusedPragmas } from '../pragma-report.ts';
import { createPragmaLedger, type PragmaLedger } from '../PragmaLedger.ts';

const REMEDY = 'Remove the pragma, or run the kit whose check it was written for.';

const it = test.extend(
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

  it('stays silent about a pragma whose covered line a check suppressed', ({ temp }) => {
    temp.write('src/a.ts', ['x; // rdy-ignore', ''].join('\n'));
    const ledger = scanning(['src/a.ts']);
    ledger.recordSuppressed('src/a.ts', 1);

    expect(warn(ledger).warnings).toStrictEqual([]);
  });

  it('stays silent about a pragma in a file no check examined', ({ temp }) => {
    temp.write('src/a.ts', ['x; // rdy-ignore', ''].join('\n'));

    expect(warn(createPragmaLedger()).warnings).toStrictEqual([]);
  });

  it('raises one warning for a file two checks both examined', ({ temp }) => {
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

  it('reads and prints an examined path a check declared in absolute form', ({ temp }) => {
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

  it('stays silent about a token the comment rule does not recognize as a site', ({ temp }) => {
    temp.write('src/a.ts', ["const token = 'rdy-ignore';", ''].join('\n'));

    expect(warn(scanning(['src/a.ts'])).warnings).toStrictEqual([]);
  });
});

// region | Helpers

/** Opens a ledger holding the given paths as examined and nothing as suppressed. */
function scanning(paths: readonly string[]): PragmaLedger {
  const ledger = createPragmaLedger();
  ledger.recordScanned(paths);
  return ledger;
}

/** Reports over one ledger, returning the entries alongside everything they wrote. */
function warn(ledger: PragmaLedger) {
  using io = captureStdio();

  const warnings = warnOnUnusedPragmas(ledger);

  return { warnings, stderr: io.stderr };
}

// endregion | Helpers
