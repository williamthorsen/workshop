import { describe, expect, it } from 'vitest';

import { SCHEMA_VERSION } from '../../schemas/verifyOutputSchema.ts';
import {
  buildVerifyOutput,
  formatKitsFailedSummary,
  formatManifestHeading,
  formatProjectsSummary,
} from '../verify-report.ts';

const UNCOMPILED = { name: 'extra', source: 'kits/extra.ts' };

describe(buildVerifyOutput, () => {
  it('omits projects and uncompiled kits from a single-manifest run that has none', () => {
    expect(buildVerifyOutput({ kits: [], passed: true, uncompiled: [] })).toStrictEqual({
      schemaVersion: SCHEMA_VERSION,
      passed: true,
      kits: [],
    });
  });

  it('includes an empty project list, which reports a sweep that found none', () => {
    expect(buildVerifyOutput({ kits: [], passed: true, projects: [], uncompiled: [] })).toHaveProperty('projects', []);
  });

  it('includes the uncompiled kits when there are any', () => {
    expect(buildVerifyOutput({ kits: [], passed: false, uncompiled: [UNCOMPILED] })).toHaveProperty('uncompiled', [
      UNCOMPILED,
    ]);
  });
});

describe(formatKitsFailedSummary, () => {
  it('counts the failed kits against every kit, after a blank line', () => {
    expect(formatKitsFailedSummary(2, 5)).toBe('\n2 of 5 kits failed verification.\n');
  });
});

describe(formatManifestHeading, () => {
  it('names the manifest in a section heading', () => {
    expect(formatManifestHeading('.readyup/manifest.json')).toMatch(
      /^\u{2500}\u{2500} Verifying kits against \.readyup\/manifest\.json.*\n$/u,
    );
  });
});

describe(formatProjectsSummary, () => {
  it('names each failed project and counts them against every project, after a blank line', () => {
    expect(formatProjectsSummary(['packages/a', 'packages/b'], 3)).toBe(
      '\nProblems in 2 of 3 projects: packages/a, packages/b\n',
    );
  });

  it('counts a single project in the singular', () => {
    expect(formatProjectsSummary(['.'], 1)).toBe('\nProblems in 1 of 1 project: .\n');
  });
});
