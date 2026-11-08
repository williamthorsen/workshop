import { describe, expect, it } from 'vitest';

import type { SkipDiagnosis } from '../../kits/types.ts';
import type { ResolvedKitEntry } from '../ResolvedKitEntry.ts';
import { listMaskedSkipWarnings } from '../skip-diagnosis.ts';

/** The entry produced by a locally-resolved kit: a name, and no package to attribute it to. */
const LOCAL_KIT: ResolvedKitEntry = { name: 'default', source: { path: '.readyup/kits/default.js' }, checklists: [] };

describe(listMaskedSkipWarnings, () => {
  it('raises skip-masks-pass for a skip that suppressed a pass', () => {
    const warnings = listWarnings([{ name: 'Coverage is at least 90%', verdict: 'masked-pass' }]);

    expect(warnings).toStrictEqual([
      {
        code: 'skip-masks-pass',
        message: 'skipped check "Coverage is at least 90%" in kit "default" / checklist "repo" would have passed.',
        remedy: 'Narrow its skip to the states in which the check would fail, or remove the skip.',
      },
    ]);
  });

  it('raises diagnosis-inconclusive for a check that reached no verdict', () => {
    const warnings = listWarnings([{ name: 'Registry is reachable', verdict: 'inconclusive', reason: 'fetch failed' }]);

    expect(warnings).toStrictEqual([
      {
        code: 'diagnosis-inconclusive',
        message:
          'skipped check "Registry is reachable" in kit "default" / checklist "repo" could not be diagnosed: fetch failed.',
        remedy: 'Fix the check so that it returns a verdict, then re-run with --diagnose.',
      },
    ]);
  });

  it('ends the sentence with one period when the reason already has one', () => {
    const warnings = listWarnings([{ name: 'a', verdict: 'inconclusive', reason: 'check() returned null.' }]);

    expect(warnings[0]?.message).toBe(
      'skipped check "a" in kit "default" / checklist "repo" could not be diagnosed: check() returned null.',
    );
  });

  it('lists one warning per diagnosis, in order, each with its remedy', () => {
    const warnings = listWarnings([
      { name: 'a', verdict: 'masked-pass' },
      { name: 'b', verdict: 'inconclusive', reason: 'boom' },
    ]);

    expect(warnings.map(({ message, remedy }) => ({ message, remedy }))).toStrictEqual([
      {
        message: 'skipped check "a" in kit "default" / checklist "repo" would have passed.',
        remedy: 'Narrow its skip to the states in which the check would fail, or remove the skip.',
      },
      {
        message: 'skipped check "b" in kit "default" / checklist "repo" could not be diagnosed: boom.',
        remedy: 'Fix the check so that it returns a verdict, then re-run with --diagnose.',
      },
    ]);
  });

  it('stays silent when diagnosis did not run', () => {
    const warnings = listWarnings(undefined);

    expect(warnings).toStrictEqual([]);
  });

  it('stays silent when diagnosis found nothing', () => {
    const warnings = listWarnings([]);

    expect(warnings).toStrictEqual([]);
  });

  describe('kit identity', () => {
    // Every kit resolved by `--sources` has the same name, so the package is the only thing that
    // tells one run entry's warnings from another's.
    it('names the publishing package beside the kit', () => {
      const warnings = listWarnings([{ name: 'a', verdict: 'masked-pass' }], buildPackagedEntry());

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

      const warnings = listWarnings([{ name: 'a', verdict: 'masked-pass' }], remote);

      expect(warnings[0]?.message).toBe('skipped check "a" in kit "deploy" / checklist "repo" would have passed.');
    });
  });
});

// region | Helpers

/** Builds the entry to which a kit published by an installed package resolves. */
function buildPackagedEntry(): ResolvedKitEntry {
  return {
    name: 'default',
    source: { path: 'node_modules/@williamthorsen/nmr/.readyup/kits/default.js' },
    checklists: [],
    provenance: {
      kind: 'package',
      packageName: '@williamthorsen/nmr',
      version: '1.2.3',
      source: 'npm:@williamthorsen/nmr',
    },
  };
}

/** Lists the warnings for one checklist's diagnoses. */
function listWarnings(diagnoses: SkipDiagnosis[] | undefined, entry: ResolvedKitEntry = LOCAL_KIT) {
  return listMaskedSkipWarnings(entry, 'repo', diagnoses);
}

// endregion | Helpers
