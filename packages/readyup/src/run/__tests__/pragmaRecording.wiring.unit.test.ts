import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, test } from 'vitest';

import type { RdyChecklist } from '../../kits/types.ts';
import { createPragmaLedger } from '../PragmaLedger.ts';
import { runRdy } from '../runRdy.ts';

const SOURCE_PATH = 'src/a.ts';

/** A source whose first line carries a pragma and whose second does not. */
const SOURCE_TEXT = ['x; // rdy-ignore', 'y;', ''].join('\n');

const it = test.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'rdy-pragma-recording-' })),
);

it.aroundEach(async (runTest, { temp }) => {
  using _cwd = pointCwdAt(temp.dir);

  await runTest();
});

describe('a run recording what its checks examined and declined', () => {
  it('records the examined paths and the declined sites', async ({ temp }) => {
    temp.write(SOURCE_PATH, SOURCE_TEXT);
    const ledger = createPragmaLedger();

    await runRdy(scanningChecklist(), { pragmaLedger: ledger });

    expect(ledger.scannedPaths()).toStrictEqual([temp.resolve(SOURCE_PATH)]);
    expect(ledger.hasDeclined(SOURCE_PATH, 1)).toBe(true);
    expect(ledger.hasDeclined(SOURCE_PATH, 2)).toBe(false);
  });

  it('records nothing for a diagnosed check', async ({ temp }) => {
    temp.write(SOURCE_PATH, SOURCE_TEXT);
    const ledger = createPragmaLedger();

    await runRdy(scanningChecklist('not applicable'), { diagnose: true, pragmaLedger: ledger });

    expect(ledger.scannedPaths()).toStrictEqual([]);
    expect(ledger.hasDeclined(SOURCE_PATH, 1)).toBe(false);
  });

  it('declines and reports as before for an invocation keeping no ledger', async ({ temp }) => {
    temp.write(SOURCE_PATH, SOURCE_TEXT);

    const report = await runRdy(scanningChecklist());

    expect(report.results[0]?.detail).toBe('src/a.ts:2');
  });
});

// region | Helpers

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

// endregion | Helpers
