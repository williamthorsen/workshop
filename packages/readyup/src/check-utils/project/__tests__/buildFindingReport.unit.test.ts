import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, test } from 'vitest';

import { buildFindingReport, type Finding } from '../buildFindingReport.ts';
import type { OwnImplementation } from '../definesOwnImplementation.ts';

interface KindedFinding extends Finding {
  kind: 'clone' | 'inline';
}

const CLONE: KindedFinding = { kind: 'clone', line: 12, path: 'src/errors.ts', symbol: 'describeError' };
const INLINE: KindedFinding = { kind: 'inline', line: 44, path: 'src/report.ts' };

const IMPLEMENTATION_PATH = 'packages/errors/src/describeError.ts';
const OWN_CLONE: KindedFinding = { kind: 'clone', line: 8, path: IMPLEMENTATION_PATH, symbol: 'describeError' };
const OWN_INLINE: KindedFinding = { kind: 'inline', line: 20, path: IMPLEMENTATION_PATH };
const SIBLING_CLONE: KindedFinding = {
  kind: 'clone',
  line: 5,
  path: 'packages/errors/src/format.ts',
  symbol: 'formatError',
};

const OWN_IMPLEMENTATION: OwnImplementation = {
  exportNames: ['describeError'],
  packageName: '@scope/errors',
  sources: [
    { path: IMPLEMENTATION_PATH, text: 'export function describeError(error: unknown) {}' },
    { path: 'packages/errors/src/format.ts', text: 'function formatError(error: unknown) {}' },
  ],
};

const it = test.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'rdy-finding-report-' })),
);

it.aroundEach(async (runTest, { temp }) => {
  using _cwd = pointCwdAt(temp.dir);

  await runTest();
});

describe(buildFindingReport, () => {
  it('passes when the check reports none of the findings the project holds', () => {
    const outcome = buildFindingReport({
      adoptedCount: 3,
      findings: [INLINE],
      shouldReport: (finding) => finding.kind === 'clone',
    });

    expect(outcome).toStrictEqual({ ok: true, progress: { count: 4, passedCount: 3, type: 'fraction' } });
  });

  it('counts an unreported finding in the denominator', () => {
    const outcome = buildFindingReport({
      adoptedCount: 1,
      findings: [CLONE, INLINE],
      shouldReport: (finding) => finding.kind === 'clone',
    });

    expect(outcome.progress).toStrictEqual({ count: 3, passedCount: 1, type: 'fraction' });
  });

  it('fails and names each reported finding, by symbol where one is declared', () => {
    const outcome = buildFindingReport({
      adoptedCount: 0,
      findings: [CLONE, INLINE],
      shouldReport: () => true,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.detail).toBe('describeError (src/errors.ts:12), src/report.ts:44');
  });

  it('passes with no detail for a project holding no findings at all', () => {
    const outcome = buildFindingReport({ adoptedCount: 0, findings: [], shouldReport: () => true });

    expect(outcome).toStrictEqual({ ok: true, progress: { count: 0, passedCount: 0, type: 'fraction' } });
  });

  describe('given a check that names its own package', () => {
    it('drops every finding sited in the implementation it names', ({ temp }) => {
      writeMonorepo(temp);

      const outcome = buildFindingReport({
        adoptedCount: 0,
        findings: [OWN_CLONE, OWN_INLINE, CLONE],
        ownImplementation: OWN_IMPLEMENTATION,
        shouldReport: () => true,
      });

      expect(outcome.detail).toBe('describeError (src/errors.ts:12)');
    });

    it('counts an exempt finding in neither half of the fraction', ({ temp }) => {
      writeMonorepo(temp);

      const outcome = buildFindingReport({
        adoptedCount: 1,
        findings: [OWN_CLONE, OWN_INLINE, CLONE],
        ownImplementation: OWN_IMPLEMENTATION,
        shouldReport: () => true,
      });

      expect(outcome.progress).toStrictEqual({ count: 2, passedCount: 1, type: 'fraction' });
    });

    it('reports a second file in that package hand-rolling the idiom', ({ temp }) => {
      writeMonorepo(temp);

      const outcome = buildFindingReport({
        adoptedCount: 0,
        findings: [OWN_CLONE, SIBLING_CLONE],
        ownImplementation: OWN_IMPLEMENTATION,
        shouldReport: () => true,
      });

      expect(outcome.ok).toBe(false);
      expect(outcome.detail).toBe('formatError (packages/errors/src/format.ts:5)');
    });

    it('passes where the implementation held the only findings', ({ temp }) => {
      writeMonorepo(temp);

      const outcome = buildFindingReport({
        adoptedCount: 2,
        findings: [OWN_CLONE, OWN_INLINE],
        ownImplementation: OWN_IMPLEMENTATION,
        shouldReport: () => true,
      });

      expect(outcome).toStrictEqual({ ok: true, progress: { count: 2, passedCount: 2, type: 'fraction' } });
    });
  });
});

// region | Helpers

/** Writes a two-workspace repo in which `packages/errors` publishes the package the fixtures name. */
function writeMonorepo(temp: TempTree): void {
  temp.writeJson('package.json', { name: 'root', private: true });
  temp.write('pnpm-workspace.yaml', ['packages:', '  - packages/*', ''].join('\n'));
  temp.writeJson('packages/errors/package.json', { name: '@scope/errors', version: '1.0.0' });
  temp.writeJson('packages/app/package.json', { name: '@scope/app', version: '1.0.0' });
}

// endregion | Helpers
