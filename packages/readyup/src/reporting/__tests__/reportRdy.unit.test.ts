import { describe, expect, it } from 'vitest';

import { richFormatter } from '../../layout/formatter.ts';
import { RETIRED_GLYPHS } from '../../test-utils/retiredGlyphs.ts';
import { reportRdy } from '../reportRdy.ts';
import { indexNaming, lineNaming, makeReport } from '../test-utils/human-report-fixtures.ts';
import { makeFailedResult, makePassedResult, makeSkippedResult } from '../test-utils/result-fixtures.ts';

const PASSED = richFormatter.tokens.passed.text;
const FAILED_ERROR = richFormatter.tokens.failedError.text;
const FAILED_WARN = richFormatter.tokens.failedWarn.text;
const FAILED_RECOMMEND = richFormatter.tokens.failedRecommend.text;
const SKIPPED_OPTIONAL = richFormatter.tokens.skippedOptional.text;
const BLOCKED = richFormatter.tokens.blockedPrecondition.text;

/** A duration above the engine's floor, so that lines eligible for one show it. */
const SLOW_MS = 250;

describe(reportRdy, () => {
  describe('status tokens', () => {
    it.each([
      ['passed', makePassedResult({ name: 'target' }), PASSED],
      ['error-failed', makeFailedResult({ name: 'target', severity: 'error' }), FAILED_ERROR],
      ['warn-failed', makeFailedResult({ name: 'target', severity: 'warn' }), FAILED_WARN],
      ['recommend-failed', makeFailedResult({ name: 'target', severity: 'recommend' }), FAILED_RECOMMEND],
      ['n/a-skipped', makeSkippedResult({ name: 'target', skipReason: 'n/a' }), SKIPPED_OPTIONAL],
      ['precondition-skipped', makeSkippedResult({ name: 'target', skipReason: 'precondition' }), BLOCKED],
    ])('leads a %s check with its token', (_case, result, token) => {
      const output = reportRdy(makeReport({ results: [result], passed: false })).body;

      expect(lineNaming(output, 'target')).toBe(`${token} target`);
    });

    it.each([...RETIRED_GLYPHS, '\u{FE0F}'])('renders no %s anywhere in the report', (retired) => {
      const output = reportRdy(
        makeReport({
          results: [
            makePassedResult({ name: 'a' }),
            makeFailedResult({ name: 'b', detail: 'why', fix: 'do it' }),
            makeSkippedResult({ name: 'c', skipReason: 'n/a' }),
            makeSkippedResult({ name: 'd', skipReason: 'precondition' }),
          ],
          passed: false,
        }),
      ).body;

      expect(output).not.toContain(retired);
    });
  });

  describe('inline detail', () => {
    it('separates a passed check detail with a middle dot', () => {
      const output = reportRdy(
        makeReport({ results: [makePassedResult({ name: 'target', detail: 'up to date' })] }),
      ).body;

      expect(lineNaming(output, 'target')).toBe(`${PASSED} target \u{00B7} up to date`);
    });

    it('separates a skip reason with a middle dot', () => {
      const output = reportRdy(
        makeReport({ results: [makeSkippedResult({ name: 'target', skipReason: 'n/a', detail: 'no lockfile' })] }),
      ).body;

      expect(lineNaming(output, 'target')).toBe(`${SKIPPED_OPTIONAL} target \u{00B7} no lockfile`);
    });

    it('brackets progress', () => {
      const output = reportRdy(
        makeReport({
          results: [makePassedResult({ name: 'target', progress: { type: 'fraction', passedCount: 7, count: 10 } })],
        }),
      ).body;

      expect(lineNaming(output, 'target')).toBe(`${PASSED} target [7 of 10]`);
    });

    it('renders percent progress', () => {
      const output = reportRdy(
        makeReport({ results: [makePassedResult({ name: 'target', progress: { type: 'percent', percent: 85 } })] }),
      ).body;

      expect(lineNaming(output, 'target')).toBe(`${PASSED} target [85%]`);
    });

    it.each([
      [12, '12 files examined'],
      [1, '1 file examined'],
      [0, '0 files examined'],
    ])('renders an empty fraction over %i examined files as the count examined', (examinedCount, expected) => {
      const output = reportRdy(
        makeReport({
          results: [
            makePassedResult({
              name: 'target',
              progress: { type: 'fraction', passedCount: 0, count: 0 },
              examinedCount,
            }),
          ],
        }),
      ).body;

      expect(lineNaming(output, 'target')).toBe(`${PASSED} target [${expected}]`);
    });

    it('renders a non-empty fraction as a fraction whatever the examined count', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makePassedResult({
              name: 'target',
              progress: { type: 'fraction', passedCount: 3, count: 5 },
              examinedCount: 9,
            }),
          ],
        }),
      ).body;

      expect(lineNaming(output, 'target')).toBe(`${PASSED} target [3 of 5]`);
    });

    it('renders an empty fraction without an examined count as a fraction', () => {
      const output = reportRdy(
        makeReport({
          results: [makePassedResult({ name: 'target', progress: { type: 'fraction', passedCount: 0, count: 0 } })],
        }),
      ).body;

      expect(lineNaming(output, 'target')).toBe(`${PASSED} target [0 of 0]`);
    });

    it('renders detail and progress together with one separator', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makePassedResult({
              name: 'target',
              detail: 'all good',
              progress: { type: 'percent', percent: 100 },
            }),
          ],
        }),
      ).body;

      expect(lineNaming(output, 'target')).toBe(`${PASSED} target \u{00B7} all good [100%]`);
    });

    it('brackets a failed check id ahead of its progress', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makeFailedResult({
              name: 'target',
              id: 'toolbelt.errors/no-instanceof-error',
              progress: { type: 'fraction', passedCount: 7, count: 10 },
            }),
          ],
        }),
      ).body;

      expect(lineNaming(output, 'target')).toBe(
        `${FAILED_ERROR} target [toolbelt.errors/no-instanceof-error] [7 of 10]`,
      );
    });

    it('renders a failed check declaring no id as it renders one today', () => {
      const output = reportRdy(makeReport({ results: [makeFailedResult({ name: 'target' })] })).body;

      expect(lineNaming(output, 'target')).toBe(`${FAILED_ERROR} target`);
    });

    it('withholds the id from a check that passed', () => {
      const output = reportRdy(
        makeReport({ results: [makePassedResult({ name: 'target', id: 'toolbelt.errors/no-instanceof-error' })] }),
      ).body;

      expect(lineNaming(output, 'target')).toBe(`${PASSED} target`);
    });

    it('withholds the id from a check that skipped', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makeSkippedResult({
              name: 'target',
              id: 'toolbelt.errors/no-instanceof-error',
              skipReason: 'n/a',
              detail: 'no lockfile',
            }),
          ],
        }),
      ).body;

      expect(lineNaming(output, 'target')).toBe(`${SKIPPED_OPTIONAL} target \u{00B7} no lockfile`);
    });

    it('retires the em-dash separator', () => {
      const output = reportRdy(
        makeReport({ results: [makePassedResult({ name: 'target', detail: 'up to date' })] }),
      ).body;

      expect(output).not.toContain('\u{2014}');
    });
  });

  describe('duration', () => {
    it('omits a duration below the floor', () => {
      const output = reportRdy(makeReport({ results: [makePassedResult({ name: 'target', durationMs: 10 })] })).body;

      expect(lineNaming(output, 'target')).toBe(`${PASSED} target`);
    });

    it('shows a duration at or above the floor', () => {
      const output = reportRdy(
        makeReport({ results: [makePassedResult({ name: 'target', durationMs: SLOW_MS })] }),
      ).body;

      expect(lineNaming(output, 'target')).toBe(`${PASSED} target (250ms)`);
    });

    it.each(['n/a', 'precondition'] as const)('omits the duration on a %s-skipped check', (skipReason) => {
      const output = reportRdy(
        makeReport({ results: [makeSkippedResult({ name: 'target', skipReason, durationMs: SLOW_MS })] }),
      ).body;

      expect(lineNaming(output, 'target')).not.toContain('ms');
    });

    it('always shows the total duration on the count line', () => {
      const output = reportRdy(makeReport({ results: [makePassedResult()], durationMs: 4 })).body;

      expect(output.split('\n').at(-1)).toBe(`${PASSED} Total: 1 passed (4ms)`);
    });
  });

  describe('failure reasons', () => {
    it('leaves the failed line stating only its claim', () => {
      const output = reportRdy(
        makeReport({ results: [makeFailedResult({ name: 'target', detail: 'lockfile is stale' })], passed: false }),
      ).body;

      expect(lineNaming(output, 'target')).toBe(`${FAILED_ERROR} target`);
    });

    it('renders the authored detail beneath, indented to the name column', () => {
      const output = reportRdy(
        makeReport({ results: [makeFailedResult({ name: 'target', detail: 'lockfile is stale' })], passed: false }),
      ).body;
      const lines = output.split('\n');

      expect(lines[1]).toBe('   lockfile is stale');
    });

    it('renders the authored detail before the labeled exception', () => {
      const output = reportRdy(
        makeReport({
          results: [makeFailedResult({ name: 'target', detail: 'lockfile is stale', error: new Error('ENOENT') })],
          passed: false,
        }),
      ).body;
      const lines = output.split('\n');

      expect(lines[1]).toBe('   lockfile is stale');
      expect(lines[2]).toBe('   Error: ENOENT');
    });

    it('renders an exception alone when no detail was authored', () => {
      const output = reportRdy(
        makeReport({ results: [makeFailedResult({ name: 'target', error: new Error('boom') })], passed: false }),
      ).body;

      expect(output.split('\n', 2)[1]).toBe('   Error: boom');
    });

    it('renders no block for a failure deriving from its children', () => {
      const output = reportRdy(
        makeReport({
          results: [makeFailedResult({ name: 'parent' }), makeFailedResult({ name: 'child', depth: 1 })],
          passed: false,
        }),
      ).body;

      expect(output.split('\n').slice(0, 2)).toStrictEqual([`${FAILED_ERROR} parent`, `   ${FAILED_ERROR} child`]);
    });

    it('indents a nested failure reason to that check\u{2019}s own name column', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makePassedResult({ name: 'parent' }),
            makePassedResult({ name: 'child', depth: 1 }),
            makeFailedResult({ name: 'grandchild', depth: 2, detail: 'went wrong' }),
          ],
          passed: false,
        }),
      ).body;

      expect(output.split('\n', 4)[3]).toBe('         went wrong');
    });
  });

  describe('count line', () => {
    it('leads with the worst severity rather than the passed count', () => {
      const output = reportRdy(
        makeReport({
          results: [makePassedResult({ name: 'a' }), makeFailedResult({ name: 'b', severity: 'warn' })],
          passed: false,
          durationMs: 142,
        }),
      ).body;

      expect(output.split('\n').at(-1)).toBe(`${FAILED_WARN} Total: 1 warning, 1 passed (142ms)`);
    });

    it('orders the fields by outcome, worst news first, and omits zeros', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makePassedResult({ name: 'a' }),
            makeFailedResult({ name: 'b', severity: 'error' }),
            makeFailedResult({ name: 'c', severity: 'recommend' }),
            makeSkippedResult({ name: 'd', skipReason: 'precondition' }),
            makeSkippedResult({ name: 'e', skipReason: 'n/a' }),
          ],
          passed: false,
          durationMs: 500,
        }),
      ).body;

      expect(output.split('\n').at(-1)).toBe(
        `${FAILED_ERROR} Total: 1 error, 1 recommendation, 1 passed, 1 blocked, 1 skipped (500ms)`,
      );
    });

    it('counts results pruned from the tree by the reporting threshold', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makePassedResult({ name: 'shown', severity: 'error' }),
            makePassedResult({ name: 'pruned', severity: 'recommend' }),
          ],
        }),
        { reportOn: 'error' },
      ).body;

      expect(output).not.toContain('pruned');
      expect(output.split('\n').at(-1)).toContain('2 passed');
    });

    // The label distinguishes the tally from the check lines above it, which lead with a token in the
    // same column.
    it('labels the count line so that it does not read as a check', () => {
      const output = reportRdy(makeReport({ results: [makePassedResult({ name: 'target' })] })).body;

      expect(output.split('\n').at(-1)).toBe(`${PASSED} Total: 1 passed (100ms)`);
    });

    it('renders no bare rule between the tree and the count line', () => {
      const output = reportRdy(makeReport({ results: [makePassedResult({ name: 'target' })] })).body;

      expect(output).not.toContain('\u{2500}\u{2500}\n');
    });

    it('closes the block with the count line, after the fix recap', () => {
      const output = reportRdy(
        makeReport({ results: [makeFailedResult({ name: 'broken', fix: 'Run pnpm install' })], passed: false }),
      ).body;
      const lines = output.split('\n');

      expect(lines.at(-1)).toBe(`${FAILED_ERROR} Total: 1 error (100ms)`);
      expect(indexNaming(output, 'Fixes')).toBeLessThan(lines.length - 1);
    });

    it('renders no blank line inside the block', () => {
      const output = reportRdy(
        makeReport({ results: [makeFailedResult({ name: 'broken', fix: 'Run pnpm install' })], passed: false }),
      ).body;

      expect(output.split('\n')).not.toContain('');
    });
  });

  describe('visible-result reporting', () => {
    it('reports an empty tree when every result is hidden', () => {
      const rendered = reportRdy(makeReport({ results: [makePassedResult({ name: 'target' })] }), { quiet: true });

      expect(rendered.hasVisibleResults).toBe(false);
      expect(rendered.body).toBe(`${PASSED} Total: 1 passed (100ms)`);
    });

    it('reports a rendered tree when a result survives', () => {
      const rendered = reportRdy(makeReport({ results: [makeFailedResult({ name: 'broken' })], passed: false }));

      expect(rendered.hasVisibleResults).toBe(true);
    });
  });

  describe('nesting', () => {
    it('indents each level by one gutter', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makePassedResult({ name: 'parent', depth: 0 }),
            makePassedResult({ name: 'child', depth: 1 }),
            makePassedResult({ name: 'grandchild', depth: 2 }),
            makePassedResult({ name: 'great-grandchild', depth: 3 }),
          ],
        }),
      ).body;

      expect(output.split('\n').slice(0, 4)).toStrictEqual([
        `${PASSED} parent`,
        `   ${PASSED} child`,
        `      ${PASSED} grandchild`,
        `         ${PASSED} great-grandchild`,
      ]);
    });

    it('renders every result that it is given, applying no suppression of its own', () => {
      // The renderer displays and counts whatever it is given, applying no suppression of its own.
      const output = reportRdy(
        makeReport({
          results: [
            makeSkippedResult({ name: 'na-check', skipReason: 'n/a', depth: 1 }),
            makeSkippedResult({ name: 'deeper', skipReason: 'precondition', depth: 2 }),
            makePassedResult({ name: 'sibling', depth: 1 }),
          ],
        }),
      ).body;

      expect(output).toContain('na-check');
      expect(output).toContain('deeper');
      expect(output).toContain('sibling');
      expect(output.split('\n').at(-1)).toContain('1 blocked');
    });

    it('includes nested results in the counts', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makePassedResult({ name: 'parent', depth: 0 }),
            makePassedResult({ name: 'child', depth: 1 }),
            makeFailedResult({ name: 'child-fail', depth: 1 }),
          ],
          passed: false,
          durationMs: 50,
        }),
      ).body;

      expect(output.split('\n').at(-1)).toBe(`${FAILED_ERROR} Total: 1 error, 2 passed (50ms)`);
    });
  });
});
