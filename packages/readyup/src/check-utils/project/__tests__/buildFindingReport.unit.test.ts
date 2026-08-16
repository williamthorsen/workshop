import { describe, expect, it } from 'vitest';

import { buildFindingReport, type Finding } from '../buildFindingReport.ts';

interface KindedFinding extends Finding {
  kind: 'clone' | 'inline';
}

const CLONE: KindedFinding = { kind: 'clone', line: 12, path: 'src/errors.ts', symbol: 'describeError' };
const INLINE: KindedFinding = { kind: 'inline', line: 44, path: 'src/report.ts' };

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
});
