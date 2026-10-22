import { describe, expect, it } from 'vitest';

import { richFormatter } from '../../layout/formatter.ts';
import { renderReportSections, reportRdy } from '../reportRdy.ts';
import { makeReport } from '../test-utils/human-report-fixtures.ts';
import { makeFailedResult, makePassedResult, makeSkippedResult } from '../test-utils/result-fixtures.ts';

const FAILED_ERROR = richFormatter.tokens.failedError.text;
const FIX = richFormatter.tokens.fix.text;

const report = makeReport({
  results: [
    makePassedResult({ name: 'present' }),
    makeFailedResult({ name: 'broken', detail: 'dist/index.js not found', fix: 'Run the build' }),
    makeSkippedResult({ name: 'bundle size', depth: 1, skipReason: 'precondition' }),
  ],
  passed: false,
});

describe(renderReportSections, () => {
  it('attributes each line of the tree to the result that produced it', () => {
    const { results } = renderReportSections(report);

    expect(results.map(({ result }) => result.name)).toStrictEqual(['present', 'broken', 'bundle size']);
    expect(results.map(({ lines }) => lines.length)).toStrictEqual([1, 2, 1]);
  });

  it("keeps a failed result's reason block with its check line", () => {
    const [, broken] = renderReportSections(report).results;

    expect(broken?.lines).toStrictEqual([`${FAILED_ERROR} broken`, '   dist/index.js not found']);
  });

  it('keeps the fix recap apart from the results', () => {
    const { results, fixes } = renderReportSections(report);

    expect(fixes).toStrictEqual(['\u{2500}\u{2500} Fixes', `${FAILED_ERROR} broken`, `   ${FIX} Run the build`]);
    expect(results.flatMap(({ lines }) => lines).join('\n')).not.toContain(FIX);
  });

  it('returns an empty recap when fixes are rendered inline', () => {
    const { results, fixes } = renderReportSections(report, { fixLocation: 'inline' });

    expect(fixes).toStrictEqual([]);
    expect(results[1]?.lines).toContain(`   ${FIX} Run the build`);
  });

  it("joins into reportRdy's body", () => {
    const { results, fixes, countLine } = renderReportSections(report);

    expect([...results.flatMap(({ lines }) => lines), ...fixes, countLine].join('\n')).toBe(reportRdy(report).body);
  });
});
