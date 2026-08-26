import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, test } from 'vitest';

import type { OutcomeFinding } from '../../kits/types.ts';
import { createPragmaLedger } from '../PragmaLedger.ts';
import { resolveFindingOutcome } from '../resolveFindingOutcome.ts';

const CLONE: OutcomeFinding = { line: 12, path: 'src/errors.ts', reported: true, symbol: 'describeError' };
const INLINE: OutcomeFinding = { line: 44, path: 'src/report.ts', reported: true };
const COUNTED: OutcomeFinding = { line: 7, path: 'src/other.ts', reported: false };

const NAMED = ['toolbelt.errors/no-instanceof-error'];

const it = test.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'rdy-finding-outcome-' })),
);

it.aroundEach(async (runTest, { temp }) => {
  using _cwd = pointCwdAt(temp.dir);

  await runTest();
});

describe(resolveFindingOutcome, () => {
  it('fails and names each reported finding, by symbol where one is declared', () => {
    const outcome = resolveFindingOutcome({ adoptedCount: 0, findings: [CLONE, INLINE] }, []);

    expect(outcome.ok).toBe(false);
    expect(outcome.detail).toBe('describeError (src/errors.ts:12), src/report.ts:44');
  });

  it('passes where the check reports none of the sites it counts', () => {
    const outcome = resolveFindingOutcome({ adoptedCount: 3, findings: [COUNTED] }, []);

    expect(outcome).toStrictEqual({ ok: true, progress: { count: 4, passedCount: 3, type: 'fraction' } });
  });

  it('counts an unreported site in the denominator', () => {
    const outcome = resolveFindingOutcome({ adoptedCount: 1, findings: [CLONE, COUNTED] }, []);

    expect(outcome.progress).toStrictEqual({ count: 3, passedCount: 1, type: 'fraction' });
  });

  it('reports no progress where the outcome names no adopted count', () => {
    const outcome = resolveFindingOutcome({ findings: [CLONE] }, []);

    expect(outcome.progress).toBeUndefined();
  });

  describe('given a source suppressing a finding', () => {
    it('drops a finding on a line with `rdy-ignore`', ({ temp }) => {
      writeSourceLine(temp, 'src/errors.ts', 12, 'error instanceof Error; // rdy-ignore');

      const outcome = resolveFindingOutcome({ adoptedCount: 0, findings: [CLONE, INLINE] }, []);

      expect(outcome.detail).toBe('src/report.ts:44');
    });

    it('drops a finding on the line after an `rdy-ignore-next-line`', ({ temp }) => {
      writeSourceLine(temp, 'src/errors.ts', 11, '// rdy-ignore-next-line -- the bootstrap shim, no deps allowed');

      const outcome = resolveFindingOutcome({ adoptedCount: 0, findings: [CLONE] }, []);

      expect(outcome).toStrictEqual({ ok: true, progress: { count: 0, passedCount: 0, type: 'fraction' } });
    });

    it('counts a suppressed finding in neither half of the fraction', ({ temp }) => {
      writeSourceLine(temp, 'src/errors.ts', 12, 'error instanceof Error; // rdy-ignore');

      const outcome = resolveFindingOutcome({ adoptedCount: 1, findings: [CLONE, INLINE] }, []);

      expect(outcome.progress).toStrictEqual({ count: 2, passedCount: 1, type: 'fraction' });
    });

    it('drops an unreported site too, so every check sheds it from the denominator', ({ temp }) => {
      writeSourceLine(temp, 'src/other.ts', 7, 'error instanceof Error; // rdy-ignore');

      const outcome = resolveFindingOutcome({ adoptedCount: 1, findings: [CLONE, COUNTED] }, []);

      expect(outcome.progress).toStrictEqual({ count: 2, passedCount: 1, type: 'fraction' });
    });

    it('keeps a finding whose path holds no readable text', () => {
      const outcome = resolveFindingOutcome({ adoptedCount: 0, findings: [CLONE] }, []);

      expect(outcome.detail).toBe('describeError (src/errors.ts:12)');
    });
  });

  describe('given a pragma naming a check', () => {
    it('drops the finding for the check it names', ({ temp }) => {
      writeSourceLine(temp, 'src/errors.ts', 12, 'x; // rdy-ignore toolbelt.errors/no-instanceof-error');

      const outcome = resolveFindingOutcome({ adoptedCount: 0, findings: [CLONE] }, NAMED);

      expect(outcome.ok).toBe(true);
    });

    it('leaves the finding standing for a check it does not name', ({ temp }) => {
      writeSourceLine(temp, 'src/errors.ts', 12, 'x; // rdy-ignore toolbelt.errors/no-instanceof-error');

      const outcome = resolveFindingOutcome({ adoptedCount: 0, findings: [CLONE] }, ['toolbelt.errors/other-check']);

      expect(outcome.detail).toBe('describeError (src/errors.ts:12)');
    });

    it('leaves the unnamed check a denominator the named check sheds', ({ temp }) => {
      writeSourceLine(temp, 'src/errors.ts', 12, 'x; // rdy-ignore toolbelt.errors/no-instanceof-error');
      const findings = [CLONE, COUNTED];

      expect(resolveFindingOutcome({ adoptedCount: 1, findings }, NAMED).progress).toStrictEqual({
        count: 2,
        passedCount: 1,
        type: 'fraction',
      });
      expect(resolveFindingOutcome({ adoptedCount: 1, findings }, ['x/y']).progress).toStrictEqual({
        count: 3,
        passedCount: 1,
        type: 'fraction',
      });
    });
  });

  describe('given a ledger', () => {
    it('records the paths the outcome declares as examined', ({ temp }) => {
      const ledger = createPragmaLedger();

      resolveFindingOutcome({ adoptedCount: 0, findings: [], scanned: ['src/quiet.ts'] }, [], ledger);

      expect(ledger.scannedPaths()).toStrictEqual([temp.resolve('src/quiet.ts')]);
    });

    it('records an examined path whose findings all survived', () => {
      const ledger = createPragmaLedger();

      resolveFindingOutcome({ adoptedCount: 0, findings: [CLONE], scanned: ['src/errors.ts'] }, [], ledger);

      expect(ledger.scannedPaths()).toHaveLength(1);
    });

    it('records no examined path where the outcome declares no sweep', () => {
      const ledger = createPragmaLedger();

      resolveFindingOutcome({ adoptedCount: 0, findings: [CLONE] }, [], ledger);

      expect(ledger.scannedPaths()).toStrictEqual([]);
    });

    it('records the site of every finding a pragma suppressed', ({ temp }) => {
      writeSourceLine(temp, 'src/errors.ts', 12, 'x; // rdy-ignore');
      const ledger = createPragmaLedger();

      resolveFindingOutcome({ adoptedCount: 0, findings: [CLONE, INLINE] }, [], ledger);

      expect(ledger.hasSuppressed('src/errors.ts', 12)).toBe(true);
      expect(ledger.hasSuppressed('src/report.ts', 44)).toBe(false);
    });

    it('records no suppression where the pragma names another check', ({ temp }) => {
      writeSourceLine(temp, 'src/errors.ts', 12, 'x; // rdy-ignore other/check');
      const ledger = createPragmaLedger();

      resolveFindingOutcome({ adoptedCount: 0, findings: [CLONE] }, NAMED, ledger);

      expect(ledger.hasSuppressed('src/errors.ts', 12)).toBe(false);
    });
  });
});

// region | Helpers

/** Writes a source whose 1-based `line` reads `text`, padded above with the blank lines that put it there. */
function writeSourceLine(temp: TempTree, path: string, line: number, text: string): void {
  temp.write(path, [...Array.from({ length: line - 1 }, () => ''), text, ''].join('\n'));
}

// endregion | Helpers
