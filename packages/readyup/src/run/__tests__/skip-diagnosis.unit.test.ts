import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import type { SkipDiagnosis } from '../../kits/types.ts';
import type { ResolvedKitEntry } from '../ResolvedKitEntry.ts';
import { warnOnMaskedSkips } from '../skip-diagnosis.ts';

/** The entry a locally-resolved kit produces: a name, and no package to attribute it to. */
const LOCAL_KIT: ResolvedKitEntry = { name: 'default', source: { path: '.readyup/kits/default.js' }, checklists: [] };

describe(warnOnMaskedSkips, () => {
  it('raises skip-masks-pass for a skip that suppressed a pass', () => {
    const { warnings } = warn([{ name: 'Coverage is at least 90%', verdict: 'masked-pass' }]);

    expect(warnings).toStrictEqual([
      {
        code: 'skip-masks-pass',
        message: 'skipped check "Coverage is at least 90%" in kit "default" / checklist "repo" would have passed.',
        remedy: 'Narrow its skip to the states where the check would fail, or remove the skip.',
      },
    ]);
  });

  it('raises diagnosis-inconclusive for a check that reached no verdict', () => {
    const { warnings } = warn([{ name: 'Registry is reachable', verdict: 'inconclusive', reason: 'fetch failed' }]);

    expect(warnings).toStrictEqual([
      {
        code: 'diagnosis-inconclusive',
        message:
          'skipped check "Registry is reachable" in kit "default" / checklist "repo" could not be diagnosed: fetch failed.',
        remedy: 'Fix the check so it returns a verdict, then re-run with --diagnose.',
      },
    ]);
  });

  it('ends the sentence with one period where the reason already carries one', () => {
    const { warnings } = warn([{ name: 'a', verdict: 'inconclusive', reason: 'check() returned null.' }]);

    expect(warnings[0]?.message).toBe(
      'skipped check "a" in kit "default" / checklist "repo" could not be diagnosed: check() returned null.',
    );
  });

  it('writes every warning to stderr', () => {
    const { stderr } = warn([
      { name: 'a', verdict: 'masked-pass' },
      { name: 'b', verdict: 'inconclusive', reason: 'boom' },
    ]);

    expect(stderr).toBe(
      'Warning: skipped check "a" in kit "default" / checklist "repo" would have passed. ' +
        'Narrow its skip to the states where the check would fail, or remove the skip.\n' +
        'Warning: skipped check "b" in kit "default" / checklist "repo" could not be diagnosed: boom. ' +
        'Fix the check so it returns a verdict, then re-run with --diagnose.\n',
    );
  });

  it('stays silent where diagnosis did not run', () => {
    const { warnings, stderr } = warn(undefined);

    expect(warnings).toStrictEqual([]);
    expect(stderr).toBe('');
  });

  it('stays silent where diagnosis found nothing', () => {
    const { warnings, stderr } = warn([]);

    expect(warnings).toStrictEqual([]);
    expect(stderr).toBe('');
  });

  describe('kit identity', () => {
    // Every kit `--packages` resolves carries the same name, so the package is the only thing that
    // tells one run entry's warnings from another's.
    it('names the publishing package beside the kit', () => {
      const { warnings } = warn([{ name: 'a', verdict: 'masked-pass' }], packagedKit());

      expect(warnings[0]?.message).toBe(
        'skipped check "a" in kit "default" from @williamthorsen/nmr / checklist "repo" would have passed.',
      );
    });

    it('names the kit alone for a source that is not a package', () => {
      const remote: ResolvedKitEntry = {
        name: 'deploy',
        source: { url: 'https://example.com/deploy.js' },
        checklists: [],
        provenance: { kind: 'remote', label: 'example.com/deploy.js' },
      };

      const { warnings } = warn([{ name: 'a', verdict: 'masked-pass' }], remote);

      expect(warnings[0]?.message).toBe('skipped check "a" in kit "deploy" / checklist "repo" would have passed.');
    });
  });
});

// region | Helpers

/** Builds the entry a kit published by an installed package resolves to. */
function packagedKit(): ResolvedKitEntry {
  return {
    name: 'default',
    source: { path: 'node_modules/@williamthorsen/nmr/.readyup/kits/default.js' },
    checklists: [],
    provenance: { kind: 'package', packageName: '@williamthorsen/nmr', version: '1.2.3' },
  };
}

/** Warns over one checklist's diagnoses, returning the entries alongside everything they wrote. */
function warn(diagnoses: SkipDiagnosis[] | undefined, entry: ResolvedKitEntry = LOCAL_KIT) {
  using io = captureStdio();

  const warnings = warnOnMaskedSkips(entry, 'repo', diagnoses);

  return { warnings, stderr: io.stderr };
}

// endregion | Helpers
