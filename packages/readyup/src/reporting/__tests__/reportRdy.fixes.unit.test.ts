import { describe, expect, it } from 'vitest';

import { richFormatter } from '../../layout/formatter.ts';
import { reportRdy } from '../reportRdy.ts';
import { indexNaming, makeReport } from '../test-utils/human-report-fixtures.ts';
import { makeFailedResult, makePassedResult } from '../test-utils/result-fixtures.ts';

const FAILED_ERROR = richFormatter.tokens.failedError.text;
const FAILED_RECOMMEND = richFormatter.tokens.failedRecommend.text;
const FIX = richFormatter.tokens.fix.text;

describe(reportRdy, () => {
  describe('fix recap in end mode', () => {
    it('attributes each fix to the check that raised it', () => {
      const output = reportRdy(
        makeReport({ results: [makeFailedResult({ name: 'broken', fix: 'Run pnpm install' })], passed: false }),
      ).body;
      const lines = output.split('\n');
      const heading = indexNaming(output, 'Fixes');

      expect(lines[heading]).toBe('\u{2500}\u{2500} Fixes');
      expect(lines[heading + 1]).toBe(`${FAILED_ERROR} broken`);
      expect(lines[heading + 2]).toBe(`   ${FIX} Run pnpm install`);
    });

    it('recaps a fix from each failed check', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makeFailedResult({ name: 'first', fix: 'fix one' }),
            makeFailedResult({ name: 'second', fix: 'fix two' }),
          ],
          passed: false,
        }),
      ).body;

      expect(output).toContain(`${FIX} fix one`);
      expect(output).toContain(`${FIX} fix two`);
    });

    it('keeps the fix out of the reason block', () => {
      const output = reportRdy(
        makeReport({
          results: [makeFailedResult({ name: 'broken', error: new Error('bad'), fix: 'Update config' })],
          passed: false,
        }),
      ).body;
      const checkLine = indexNaming(output, 'broken');

      expect(output.split('\n')[checkLine + 1]).toBe('   Error: bad');
      expect(output.split('\n')[checkLine + 2]).not.toContain('Update config');
    });

    it('omits the recap when no failed check has a fix', () => {
      const output = reportRdy(
        makeReport({ results: [makeFailedResult({ name: 'broken', error: new Error('bad') })], passed: false }),
      ).body;

      expect(output).not.toContain('Fixes');
      expect(output).not.toContain(FIX);
    });

    it('recaps a nested check by name', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makePassedResult({ name: 'parent' }),
            makeFailedResult({ name: 'child', depth: 1, fix: 'fix child' }),
          ],
          passed: false,
        }),
      ).body;

      // The tree's own `   ❌ child` satisfies a substring match, so the recapped line is pinned by its
      // exact form: The recap flattens nesting rather than mirroring the tree's indent.
      expect(output.split('\n')).toContain(`${FAILED_ERROR} child`);
      expect(output.split('\n')).toContain(`   ${FIX} fix child`);
    });

    // The recap names the check with the token that the tree gave it: A reader scanning fixes sees which
    // have errors and which have recommendations.
    it('leads a recapped check with its own severity token', () => {
      const output = reportRdy(
        makeReport({
          results: [makeFailedResult({ name: 'drifted', severity: 'recommend', fix: 'Rerun the sync' })],
          passed: false,
        }),
      ).body;

      expect(output).toContain(`${FAILED_RECOMMEND} drifted`);
    });

    it('renders the shape that an inline fix renders, less the reason', () => {
      const results = [makeFailedResult({ name: 'broken', detail: 'two files drifted', fix: 'Run pnpm install' })];
      const recapped = reportRdy(makeReport({ results, passed: false })).body.split('\n');
      const inline = reportRdy(makeReport({ results, passed: false }), { fixLocation: 'inline' }).body.split('\n');
      const heading = indexNaming(recapped.join('\n'), 'Fixes');

      expect(recapped.slice(heading + 1, heading + 3)).toStrictEqual([inline[0], inline[2]]);
    });

    it('is the default when no options are given', () => {
      const output = reportRdy(
        makeReport({ results: [makeFailedResult({ name: 'broken', fix: 'Fix it' })], passed: false }),
      ).body;

      expect(output).toContain('\u{2500}\u{2500} Fixes');
    });
  });

  describe('fix in inline mode', () => {
    it('joins the fix to the reason block beneath the check', () => {
      const output = reportRdy(
        makeReport({
          results: [makeFailedResult({ name: 'broken', error: new Error('Something went wrong'), fix: 'Run install' })],
          passed: false,
        }),
        { fixLocation: 'inline' },
      ).body;

      expect(output.split('\n').slice(0, 3)).toStrictEqual([
        `${FAILED_ERROR} broken`,
        '   Error: Something went wrong',
        `   ${FIX} Run install`,
      ]);
    });

    it('renders a fix without an exception', () => {
      const output = reportRdy(
        makeReport({ results: [makeFailedResult({ name: 'broken', fix: 'Run install' })], passed: false }),
        { fixLocation: 'inline' },
      ).body;

      expect(output.split('\n', 2)[1]).toBe(`   ${FIX} Run install`);
      expect(output).not.toContain('Error:');
    });

    it('renders an exception without a fix', () => {
      const output = reportRdy(
        makeReport({
          results: [makeFailedResult({ name: 'broken', error: new Error('Missing file') })],
          passed: false,
        }),
        { fixLocation: 'inline' },
      ).body;

      expect(output).toContain('Error: Missing file');
      expect(output).not.toContain(FIX);
    });

    it('adds no end-of-report recap', () => {
      const output = reportRdy(
        makeReport({ results: [makeFailedResult({ name: 'broken', fix: 'Run install' })], passed: false }),
        { fixLocation: 'inline' },
      ).body;

      expect(output).not.toContain('Fixes');
    });

    it('indents a nested fix to that check\u{2019}s own name column', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makePassedResult({ name: 'parent' }),
            makeFailedResult({ name: 'child', depth: 1, error: new Error('child error'), fix: 'fix child' }),
          ],
          passed: false,
        }),
        { fixLocation: 'inline' },
      ).body;
      const lines = output.split('\n');

      expect(lines[2]).toBe('      Error: child error');
      expect(lines[3]).toBe(`      ${FIX} fix child`);
    });
  });
});
