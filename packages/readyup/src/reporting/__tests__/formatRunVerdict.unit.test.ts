import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setStyle } from '../../layout/engine.ts';
import { formatRunVerdict, type RunVerdictInput } from '../formatRunVerdict.ts';

describe(formatRunVerdict, () => {
  beforeEach(() => {
    setStyle('plain');
  });

  afterEach(() => {
    setStyle('rich');
  });

  it('states a pass and the threshold shared by every kit', () => {
    const verdict = formatRunVerdict(
      makeInput({
        kitThresholds: [
          { kitName: 'deploy', failOn: 'warn' },
          { kitName: 'audit', failOn: 'warn' },
        ],
      }),
    );

    expect(verdict).toBe('PASS  Run passed (fail-on: warn)');
  });

  it('states a failure', () => {
    expect(formatRunVerdict(makeInput({ passed: false }))).toBe('FAIL  Run failed (fail-on: error)');
  });

  it('names each threshold with its kits, most severe first, when kits differ', () => {
    const verdict = formatRunVerdict(
      makeInput({
        kitThresholds: [
          { kitName: 'audit', failOn: 'warn' },
          { kitName: 'deploy', failOn: 'error' },
          { kitName: 'release', failOn: 'error' },
        ],
        passed: false,
      }),
    );

    expect(verdict).toBe('FAIL  Run failed (fail-on: error for deploy, release; warn for audit)');
  });

  it('states an incomplete run without a threshold when a kit did not run', () => {
    expect(formatRunVerdict(makeInput({ missingKitCount: 1, passed: true }))).toBe(
      'FAIL  Run incomplete: 1 kit did not run',
    );
    expect(formatRunVerdict(makeInput({ kitThresholds: [], missingKitCount: 2 }))).toBe(
      'FAIL  Run incomplete: 2 kits did not run',
    );
  });

  it('precedes the verdict with a hint naming one withheld failing check', () => {
    const verdict = formatRunVerdict(makeInput({ passed: false, withheld: { count: 1, showAt: 'recommend' } }));

    expect(verdict.split('\n')).toStrictEqual([
      'Hint: 1 failing check is not shown; rerun with --report-on recommend to show it',
      'FAIL  Run failed (fail-on: error)',
    ]);
  });

  it('counts several withheld failing checks', () => {
    const verdict = formatRunVerdict(makeInput({ passed: false, withheld: { count: 3, showAt: 'warn' } }));

    expect(verdict.split('\n', 1)[0]).toBe(
      'Hint: 3 failing checks are not shown; rerun with --report-on warn to show them',
    );
  });

  it('omits the hint when nothing was withheld', () => {
    expect(formatRunVerdict(makeInput({ withheld: { count: 0, showAt: 'warn' } }))).toBe(
      'PASS  Run passed (fail-on: error)',
    );
  });
});

// region | Helpers

/** Returns a passing single-kit verdict input under the default threshold, with `overrides` applied. */
function makeInput(overrides: Partial<RunVerdictInput> = {}): RunVerdictInput {
  return {
    kitThresholds: [{ kitName: 'deploy', failOn: 'error' }],
    missingKitCount: 0,
    passed: true,
    withheld: undefined,
    ...overrides,
  };
}

// endregion | Helpers
