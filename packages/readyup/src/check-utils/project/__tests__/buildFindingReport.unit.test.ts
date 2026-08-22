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
  it('marks each retained finding with whether the calling check reports it', () => {
    const outcome = buildFindingReport({
      adoptedCount: 3,
      findings: [CLONE, INLINE],
      shouldReport: (finding) => finding.kind === 'clone',
    });

    expect(outcome).toStrictEqual({
      adoptedCount: 3,
      findings: [
        { line: 12, path: 'src/errors.ts', reported: true, symbol: 'describeError' },
        { line: 44, path: 'src/report.ts', reported: false },
      ],
    });
  });

  it('returns no findings for a project holding none', () => {
    const outcome = buildFindingReport({ adoptedCount: 0, findings: [], shouldReport: () => true });

    expect(outcome).toStrictEqual({ adoptedCount: 0, findings: [] });
  });

  it('declines nothing, leaving a site carrying a pragma to the runner', ({ temp }) => {
    temp.write('src/errors.ts', ['', ...Array.from({ length: 10 }, () => ''), 'x; // rdy-ignore', ''].join('\n'));

    const outcome = buildFindingReport({ adoptedCount: 0, findings: [CLONE], shouldReport: () => true });

    expect(outcome.findings).toHaveLength(1);
  });

  describe('given a check declaring the sources it swept', () => {
    it('reports every swept path as examined', () => {
      const outcome = buildFindingReport({
        adoptedCount: 0,
        findings: [CLONE],
        shouldReport: () => true,
        sources: [
          { path: 'src/errors.ts', text: '' },
          { path: 'src/quiet.ts', text: '' },
        ],
      });

      expect(outcome.scanned).toStrictEqual(['src/errors.ts', 'src/quiet.ts']);
    });

    it('reports a path the own-implementation exemption dropped every finding from', ({ temp }) => {
      writeMonorepo(temp);

      const outcome = buildFindingReport({
        adoptedCount: 0,
        findings: [OWN_CLONE],
        ownImplementation: OWN_IMPLEMENTATION,
        shouldReport: () => true,
        sources: [{ path: IMPLEMENTATION_PATH, text: '' }],
      });

      expect(outcome).toStrictEqual({ adoptedCount: 0, findings: [], scanned: [IMPLEMENTATION_PATH] });
    });

    it('omits `scanned` where the check declared no sources', () => {
      const outcome = buildFindingReport({ adoptedCount: 0, findings: [CLONE], shouldReport: () => true });

      expect(outcome).not.toHaveProperty('scanned');
    });

    it('reports an empty sweep as one, distinguishing it from a check declaring none', () => {
      const outcome = buildFindingReport({ adoptedCount: 0, findings: [], shouldReport: () => true, sources: [] });

      expect(outcome.scanned).toStrictEqual([]);
    });
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

      expect(outcome.findings).toStrictEqual([
        { line: 12, path: 'src/errors.ts', reported: true, symbol: 'describeError' },
      ]);
    });

    it('reports a second file in that package hand-rolling the idiom', ({ temp }) => {
      writeMonorepo(temp);

      const outcome = buildFindingReport({
        adoptedCount: 0,
        findings: [OWN_CLONE, SIBLING_CLONE],
        ownImplementation: OWN_IMPLEMENTATION,
        shouldReport: () => true,
      });

      expect(outcome.findings).toStrictEqual([
        { line: 5, path: 'packages/errors/src/format.ts', reported: true, symbol: 'formatError' },
      ]);
    });

    it('returns no findings where the implementation held them all', ({ temp }) => {
      writeMonorepo(temp);

      const outcome = buildFindingReport({
        adoptedCount: 2,
        findings: [OWN_CLONE, OWN_INLINE],
        ownImplementation: OWN_IMPLEMENTATION,
        shouldReport: () => true,
      });

      expect(outcome).toStrictEqual({ adoptedCount: 2, findings: [] });
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
