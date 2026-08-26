import { promisify } from 'node:util';

import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, test, vi } from 'vitest';

const execFileAsync = vi.hoisted(() =>
  vi.fn<(file: string, args: string[]) => Promise<{ stdout: string; stderr: string }>>(),
);

vi.mock('node:child_process', () => {
  const stub = Object.assign(vi.fn(), { [promisify.custom]: execFileAsync });
  return { execFile: stub };
});

import { readTrackedSources } from '../../check-utils/project/readTrackedSources.ts';
import type { RdyCheck, RdyChecklist, SkipResult } from '../../kits/types.ts';
import { createPragmaLedger } from '../PragmaLedger.ts';
import { runRdy } from '../runRdy.ts';

const SOURCE_PATH = 'src/a.ts';
const OTHER_PATH = 'src/b.ts';

/** A source whose first line has a pragma and whose second does not. */
const SOURCE_TEXT = ['x; // rdy-ignore', 'y;', ''].join('\n');

const it = test.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'rdy-pragma-recording-' })),
);

it.aroundEach(async (runTest, { temp }) => {
  using _cwd = pointCwdAt(temp.dir);
  trackPaths(OTHER_PATH, SOURCE_PATH);

  await runTest();
});

describe('a run recording what its checks examined and suppressed', () => {
  it('records the examined paths and the suppressed sites', async ({ temp }) => {
    temp.write(SOURCE_PATH, SOURCE_TEXT);
    const ledger = createPragmaLedger();

    await runRdy(scanningChecklist(), { pragmaLedger: ledger });

    expect(ledger.scannedPaths()).toStrictEqual([temp.resolve(SOURCE_PATH)]);
    expect(ledger.hasSuppressed(SOURCE_PATH, 1)).toBe(true);
    expect(ledger.hasSuppressed(SOURCE_PATH, 2)).toBe(false);
  });

  it('records no path and no suppression for a diagnosed check', async ({ temp }) => {
    temp.write(SOURCE_PATH, SOURCE_TEXT);
    const ledger = createPragmaLedger();

    await runRdy(scanningChecklist('not applicable'), { diagnose: true, pragmaLedger: ledger });

    expect(ledger.scannedPaths()).toStrictEqual([]);
    expect(ledger.hasSuppressed(SOURCE_PATH, 1)).toBe(false);
  });

  it('suppresses and reports as before for an invocation keeping no ledger', async ({ temp }) => {
    temp.write(SOURCE_PATH, SOURCE_TEXT);

    const report = await runRdy(scanningChecklist());

    expect(report.results[0]?.detail).toBe('src/a.ts:2');
  });

  it('records a sweep read through readTrackedSources, which declares nothing', async ({ temp }) => {
    temp.write(SOURCE_PATH, SOURCE_TEXT);
    const ledger = createPragmaLedger();

    await runRdy(adoptionChecklist(sweepingCheck({ path: SOURCE_PATH })), { pragmaLedger: ledger });

    expect(ledger.scannedPaths()).toStrictEqual([temp.resolve(SOURCE_PATH)]);
  });

  it('records a sweep a check reads in its skip, which is where a memoizing kit reads one', async ({ temp }) => {
    temp.write(SOURCE_PATH, SOURCE_TEXT);
    const ledger = createPragmaLedger();

    await runRdy(adoptionChecklist(skipSweepingCheck(SOURCE_PATH)), { pragmaLedger: ledger });

    expect(ledger.scannedPaths()).toStrictEqual([temp.resolve(SOURCE_PATH)]);
  });

  it('records a sweep a check read in its skip before that skip turned the check off', async ({ temp }) => {
    temp.write(SOURCE_PATH, SOURCE_TEXT);
    const ledger = createPragmaLedger();

    await runRdy(adoptionChecklist(skipSweepingCheck(SOURCE_PATH, 'not applicable')), { pragmaLedger: ledger });

    expect(ledger.scannedPaths()).toStrictEqual([temp.resolve(SOURCE_PATH)]);
  });

  it('records no sweep for a diagnosed check running alongside one that records', async ({ temp }) => {
    temp.write(SOURCE_PATH, SOURCE_TEXT);
    temp.write(OTHER_PATH, SOURCE_TEXT);
    const ledger = createPragmaLedger();

    const report = await runRdy(
      adoptionChecklist(
        sweepingCheck({ path: SOURCE_PATH }),
        sweepingCheck({ path: OTHER_PATH, skipReason: 'not applicable' }),
      ),
      { diagnose: true, pragmaLedger: ledger },
    );

    // The diagnosis is what ran the skipped check's sweep, so without it the absent path proves nothing.
    expect(report.diagnoses).toStrictEqual([
      { name: `No source at ${OTHER_PATH} hand-rolls the idiom`, verdict: 'masked-pass' },
    ]);
    expect(ledger.scannedPaths()).toStrictEqual([temp.resolve(SOURCE_PATH)]);
  });
});

// region | Helpers

/** Wraps checks as the one adoption checklist a test runs. */
function adoptionChecklist(...checks: RdyCheck[]): RdyChecklist {
  return { name: 'adoption', checks };
}

/**
 * Builds a checklist whose one check sweeps the source and reports a finding on each of its two lines,
 * skipping for the reason given where one is passed.
 */
function scanningChecklist(skipReason?: string): RdyChecklist {
  return {
    name: 'adoption',
    checks: [
      {
        name: 'No source hand-rolls the idiom',
        check: () => ({
          adoptedCount: 0,
          findings: [
            { line: 1, path: SOURCE_PATH, reported: true },
            { line: 2, path: SOURCE_PATH, reported: true },
          ],
          scanned: [SOURCE_PATH],
        }),
        ...(skipReason !== undefined && { skip: () => skipReason }),
      },
    ],
  };
}

/**
 * Builds a check that sweeps its path in `skip`, as a kit memoizing one sweep does, then skips for the reason
 * given or runs where none is.
 */
function skipSweepingCheck(path: string, skipReason?: string): RdyCheck {
  return {
    name: `No source at ${path} hand-rolls the idiom`,
    skip: async (): Promise<SkipResult> => {
      await sweep(path);
      return skipReason ?? false;
    },
    check: () => true,
  };
}

/** Reads the one tracked path, as an adoption check reads the project. */
async function sweep(path: string): Promise<void> {
  await readTrackedSources((tracked) => tracked === path);
}

/** Builds a check that sweeps its path in `check` and reports no finding, skipping where a reason is given. */
function sweepingCheck(options: { path: string; skipReason?: string }): RdyCheck {
  const { path, skipReason } = options;
  return {
    name: `No source at ${path} hand-rolls the idiom`,
    ...(skipReason !== undefined && { skip: () => skipReason }),
    check: async () => {
      await sweep(path);
      return true;
    },
  };
}

/** Stubs the repo probe with a working tree, and the listing with the given paths. */
function trackPaths(...paths: string[]): void {
  execFileAsync.mockImplementation((_file, args) => {
    if (args.includes('rev-parse')) return Promise.resolve({ stdout: '.git\n', stderr: '' });
    return Promise.resolve({ stdout: `${paths.join('\0')}\0`, stderr: '' });
  });
}

// endregion | Helpers
