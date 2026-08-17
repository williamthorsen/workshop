import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import type { SkipDiagnosis } from '../../kits/types.ts';
import { warnOnMaskedSkips } from '../skip-diagnosis.ts';

describe(warnOnMaskedSkips, () => {
  it('raises skip-masks-pass for a skip that suppressed a pass', () => {
    const warnings = warn([{ name: 'Coverage is at least 90%', verdict: 'masked-pass' }]);

    expect(warnings.warnings).toStrictEqual([
      {
        code: 'skip-masks-pass',
        message: 'skipped check "Coverage is at least 90%" in kit "default" / checklist "repo" would have passed.',
        remedy: 'Narrow its skip to the states where the check would fail, or remove the skip.',
      },
    ]);
  });

  it('raises diagnosis-inconclusive for a check that reached no verdict', () => {
    const warnings = warn([{ name: 'Registry is reachable', verdict: 'inconclusive', reason: 'fetch failed' }]);

    expect(warnings.warnings).toStrictEqual([
      {
        code: 'diagnosis-inconclusive',
        message:
          'skipped check "Registry is reachable" in kit "default" / checklist "repo" could not be diagnosed: fetch failed.',
        remedy: 'Fix the check so it returns a verdict, then re-run with --diagnose.',
      },
    ]);
  });

  it('ends the sentence with one period where the reason already carries one', () => {
    const warnings = warn([{ name: 'a', verdict: 'inconclusive', reason: 'check() returned null.' }]);

    expect(warnings.warnings[0]?.message).toBe(
      'skipped check "a" in kit "default" / checklist "repo" could not be diagnosed: check() returned null.',
    );
  });

  it('writes every warning to stderr', () => {
    const warnings = warn([
      { name: 'a', verdict: 'masked-pass' },
      { name: 'b', verdict: 'inconclusive', reason: 'boom' },
    ]);

    expect(warnings.stderr).toBe(
      'Warning: skipped check "a" in kit "default" / checklist "repo" would have passed. ' +
        'Narrow its skip to the states where the check would fail, or remove the skip.\n' +
        'Warning: skipped check "b" in kit "default" / checklist "repo" could not be diagnosed: boom. ' +
        'Fix the check so it returns a verdict, then re-run with --diagnose.\n',
    );
  });

  it('stays silent where diagnosis did not run', () => {
    const warnings = warn(undefined);

    expect(warnings.warnings).toStrictEqual([]);
    expect(warnings.stderr).toBe('');
  });

  it('stays silent where diagnosis found nothing', () => {
    const warnings = warn([]);

    expect(warnings.warnings).toStrictEqual([]);
    expect(warnings.stderr).toBe('');
  });
});

// region | Helpers

/** Warns over one checklist's diagnoses, returning the entries alongside everything they wrote. */
function warn(diagnoses: SkipDiagnosis[] | undefined) {
  using io = captureStdio();

  const warnings = warnOnMaskedSkips('default', 'repo', diagnoses);

  return { warnings, stderr: io.stderr };
}

// endregion | Helpers
