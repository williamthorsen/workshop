import { describe, expect, it } from 'vitest';

import { formatCombinedSummary } from '../src/formatCombinedSummary.ts';
import { countResults, formatSummaryCounts, formatSummaryCountsPlain, reportRdy } from '../src/reportRdy.ts';
import { runRdy } from '../src/runRdy.ts';
import type { RdyChecklist, SummaryCounts } from '../src/types.ts';
import { formatReport } from './helpers/formatReport.ts';

/**
 * A checklist exercising every count-divergence hazard at once: a nested n/a parent, an
 * n/a precondition, a failed gate with dependents, and a failure below the reporting threshold.
 */
const checklist: RdyChecklist = {
  name: 'deploy',
  preconditions: [{ name: 'pre-na', check: () => true, skip: () => 'not applicable' }],
  checks: [
    {
      name: 'na-parent',
      check: () => true,
      skip: () => 'not applicable',
      checks: [
        {
          name: 'na-child',
          check: () => true,
          checks: [{ name: 'na-grandchild', check: () => true }],
        },
      ],
    },
    {
      name: 'gate-fails',
      check: () => false,
      checks: [{ name: 'blocked-child', check: () => true }],
    },
    { name: 'warn-fail', check: () => false, severity: 'warn' },
    { name: 'passes', check: () => true },
  ],
};

/** A checklist whose only failing check sits under a passing parent that is below the reporting threshold. */
const nestedChecklist: RdyChecklist = {
  name: 'nested',
  checks: [
    {
      name: 'context-parent',
      check: () => true,
      severity: 'recommend',
      checks: [{ name: 'failing-child', check: () => false, severity: 'error' }],
    },
  ],
};

const expectedCounts: SummaryCounts = {
  passed: 1,
  errors: 1,
  warnings: 1,
  recommendations: 0,
  blocked: 1,
  optional: 2,
  worstSeverity: 'error',
};

describe('count agreement across views', () => {
  it('tallies the same counts for every view when the reporting threshold prunes results', async () => {
    const report = await runRdy(checklist);
    const counts = countResults(report.results);

    expect(counts).toStrictEqual(expectedCounts);

    // Human tail line.
    const human = reportRdy(report, { reportOn: 'error' });
    expect(human).toContain(formatSummaryCounts(expectedCounts));

    // Combined-summary table row.
    const table = formatCombinedSummary([{ name: 'deploy', ...counts, durationMs: report.durationMs }]);
    expect(table).toContain(formatSummaryCountsPlain(expectedCounts));

    // JSON payload: the same tally, nested under `counts` with the verdict beside it.
    const { worstSeverity, ...numericCounts } = expectedCounts;
    const parsed: unknown = JSON.parse(
      formatReport([{ name: 'kit', entries: [{ name: 'deploy', report }] }], { reportOn: 'error' }),
    );
    expect(parsed).toMatchObject({ counts: numericCounts, worstSeverity });
  });

  it('prunes below-threshold results from the detail tree without altering the counts', async () => {
    const report = await runRdy(checklist);

    const human = reportRdy(report, { reportOn: 'error' });
    const json = formatReport([{ name: 'kit', entries: [{ name: 'deploy', report }] }], { reportOn: 'error' });

    expect(human).not.toContain('warn-fail');
    expect(json).not.toContain('warn-fail');
    expect(human).toContain('gate-fails');
    expect(json).toContain('gate-fails');
  });

  it('retains the parent chain of a visible result in every view', async () => {
    const report = await runRdy(nestedChecklist);

    const human = reportRdy(report, { reportOn: 'error' });
    const parsed: unknown = JSON.parse(
      formatReport([{ name: 'kit', entries: [{ name: 'nested', report }] }], { reportOn: 'error' }),
    );

    expect(human).toContain('context-parent');
    expect(human.indexOf('context-parent')).toBeLessThan(human.indexOf('failing-child'));
    expect(parsed).toMatchObject({
      kits: [{ checklists: [{ checks: [{ name: 'context-parent', checks: [{ name: 'failing-child' }] }] }] }],
    });
  });

  it('emits no descendants of an n/a result in any view', async () => {
    const report = await runRdy(checklist);

    const human = reportRdy(report);
    const json = formatReport([{ name: 'kit', entries: [{ name: 'deploy', report }] }]);

    for (const name of ['na-child', 'na-grandchild']) {
      expect(human).not.toContain(name);
      expect(json).not.toContain(name);
    }
    expect(human).toContain('na-parent');
    expect(json).toContain('na-parent');
  });
});
