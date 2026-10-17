import { describe, expect, it } from 'vitest';

import type { RdyResult } from '../../kits/types.ts';
import { richFormatter } from '../../layout/formatter.ts';
import { reportRdy } from '../reportRdy.ts';
import { lineNaming, makeReport } from '../test-utils/human-report-fixtures.ts';
import { makeFailedResult, makePassedResult, makeSkippedResult } from '../test-utils/result-fixtures.ts';

const PASSED = richFormatter.tokens.passed.text;
const FAILED_ERROR = richFormatter.tokens.failedError.text;
const FAILED_WARN = richFormatter.tokens.failedWarn.text;
const SKIPPED_OPTIONAL = richFormatter.tokens.skippedOptional.text;
const BLOCKED = richFormatter.tokens.blockedPrecondition.text;
const FIX = richFormatter.tokens.fix.text;

describe(reportRdy, () => {
  describe('quiet', () => {
    it('hides a passed check', () => {
      const output = reportRdy(
        makeReport({
          results: [makePassedResult({ name: 'quiet-pass' }), makeFailedResult({ name: 'loud-fail' })],
          passed: false,
        }),
        { quiet: true },
      ).body;

      expect(output).not.toContain('quiet-pass');
      expect(output).toContain('loud-fail');
    });

    it('keeps failures, skips, and blocks', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makePassedResult({ name: 'hidden' }),
            makeFailedResult({ name: 'failure' }),
            makeSkippedResult({ name: 'optional-skip', skipReason: 'n/a' }),
            makeSkippedResult({ name: 'blocked-skip', skipReason: 'precondition' }),
          ],
          passed: false,
        }),
        { quiet: true },
      ).body;

      expect(output).not.toContain('hidden');
      for (const name of ['failure', 'optional-skip', 'blocked-skip']) {
        expect(output).toContain(name);
      }
    });

    it('retains a passed ancestor so that a deep failure stays reachable', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makePassedResult({ name: 'passed-parent' }),
            makePassedResult({ name: 'passed-child', depth: 1 }),
            makeFailedResult({ name: 'deep-failure', depth: 2 }),
          ],
          passed: false,
        }),
        { quiet: true },
      ).body;

      expect(output.split('\n').slice(0, 3)).toStrictEqual([
        `${PASSED} passed-parent`,
        `   ${PASSED} passed-child`,
        `      ${FAILED_ERROR} deep-failure`,
      ]);
    });

    it('drops a wholly passing subtree', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makePassedResult({ name: 'clean-parent' }),
            makePassedResult({ name: 'clean-child', depth: 1 }),
            makeFailedResult({ name: 'failure' }),
          ],
          passed: false,
        }),
        { quiet: true },
      ).body;

      expect(output).not.toContain('clean-parent');
      expect(output).not.toContain('clean-child');
      expect(output).toContain('failure');
    });

    it('counts hidden passes, so the tally still covers the whole run', () => {
      const output = reportRdy(
        makeReport({
          results: [makePassedResult({ name: 'a' }), makePassedResult({ name: 'b' }), makeFailedResult({ name: 'c' })],
          passed: false,
          durationMs: 90,
        }),
        { quiet: true },
      ).body;

      expect(output.split('\n').at(-1)).toBe(`${FAILED_ERROR} Total: 1 error, 2 passed (90ms)`);
    });

    it('keeps the fix recap', () => {
      const output = reportRdy(
        makeReport({
          results: [makePassedResult({ name: 'hidden' }), makeFailedResult({ name: 'broken', fix: 'Run install' })],
          passed: false,
        }),
        { quiet: true },
      ).body;

      expect(output).toContain(`${FAILED_ERROR} broken`);
      expect(output).toContain(`   ${FIX} Run install`);
    });

    it('composes with the reporting threshold rather than overriding it', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makePassedResult({ name: 'passed-error-sev', severity: 'error' }),
            makeFailedResult({ name: 'warn-failure', severity: 'warn' }),
            makeFailedResult({ name: 'error-failure', severity: 'error' }),
          ],
          passed: false,
        }),
        { quiet: true, reportOn: 'error' },
      ).body;

      // Hidden by quiet (passed), by the threshold (warn), and shown by both (error failure).
      expect(output).not.toContain('passed-error-sev');
      expect(output).not.toContain('warn-failure');
      expect(output).toContain('error-failure');
    });

    it('shows every passed check when off', () => {
      const output = reportRdy(makeReport({ results: [makePassedResult({ name: 'visible' })] }), { quiet: false }).body;

      expect(output).toContain('visible');
    });

    it('leaves an all-passing run with only its count line', () => {
      const output = reportRdy(
        makeReport({ results: [makePassedResult({ name: 'a' }), makePassedResult({ name: 'b' })], durationMs: 30 }),
        { quiet: true },
      ).body;

      expect(output).toBe(`${PASSED} Total: 2 passed (30ms)`);
    });
  });

  describe('per-check quiet', () => {
    it('hides a quiet check that passes, leaving its loud siblings alone', () => {
      const output = reportRdy(
        makeReport({
          results: [makePassedResult({ name: 'quiet-pass', quiet: true }), makePassedResult({ name: 'loud-pass' })],
        }),
      ).body;

      expect(output).not.toContain('quiet-pass');
      expect(output).toContain('loud-pass');
    });

    it('reports a quiet check that fails, with its detail and its fix', () => {
      const output = reportRdy(
        makeReport({
          results: [makeFailedResult({ name: 'quiet-fail', quiet: true, detail: 'two remain', fix: 'Run install' })],
          passed: false,
        }),
      ).body;

      expect(output).toContain('quiet-fail');
      expect(output).toContain('   two remain');
      expect(output).toContain(`${FAILED_ERROR} quiet-fail`);
      expect(output).toContain(`   ${FIX} Run install`);
    });

    it('reports a quiet check that is skipped', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makeSkippedResult({ name: 'quiet-optional', quiet: true, skipReason: 'n/a', detail: 'no target' }),
            makeSkippedResult({ name: 'quiet-blocked', quiet: true, skipReason: 'precondition' }),
          ],
        }),
      ).body;

      expect(lineNaming(output, 'quiet-optional')).toBe(`${SKIPPED_OPTIONAL} quiet-optional \u{00B7} no target`);
      expect(lineNaming(output, 'quiet-blocked')).toBe(`${BLOCKED} quiet-blocked`);
    });

    it('counts a hidden quiet pass, so the tally still covers the whole run', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makePassedResult({ name: 'hidden', quiet: true }),
            makePassedResult({ name: 'shown' }),
            makeFailedResult({ name: 'broken' }),
          ],
          passed: false,
          durationMs: 90,
        }),
      ).body;

      expect(output.split('\n').at(-1)).toBe(`${FAILED_ERROR} Total: 1 error, 2 passed (90ms)`);
    });

    it('retains a quiet passing parent so that a deep failure stays reachable', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makePassedResult({ name: 'quiet-parent', quiet: true }),
            makeFailedResult({ name: 'deep-failure', depth: 1 }),
          ],
          passed: false,
        }),
      ).body;

      expect(output.split('\n').slice(0, 2)).toStrictEqual([
        `${PASSED} quiet-parent`,
        `   ${FAILED_ERROR} deep-failure`,
      ]);
    });

    it('drops a quiet passing child without dropping its parent', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makePassedResult({ name: 'loud-parent' }),
            makePassedResult({ name: 'quiet-child', depth: 1, quiet: true }),
          ],
        }),
      ).body;

      expect(output).toContain('loud-parent');
      expect(output).not.toContain('quiet-child');
    });

    it('renders what --quiet renders when every check declares it', () => {
      const buildResults = (quiet: boolean): RdyResult[] => [
        makePassedResult({ name: 'parent', quiet }),
        makeFailedResult({ name: 'deep-failure', depth: 1, quiet, detail: 'two remain', fix: 'Run install' }),
        makePassedResult({ name: 'clean', quiet }),
        makeSkippedResult({ name: 'optional-skip', quiet, skipReason: 'n/a', detail: 'no target' }),
        makeSkippedResult({ name: 'blocked-skip', quiet, skipReason: 'precondition' }),
      ];

      const byFlag = reportRdy(makeReport({ results: buildResults(false), passed: false, durationMs: 90 }), {
        quiet: true,
      }).body;
      const byField = reportRdy(makeReport({ results: buildResults(true), passed: false, durationMs: 90 }), {
        quiet: false,
      }).body;

      expect(byField).toBe(byFlag);
      expect(byField).not.toContain('clean');
    });
  });

  describe('reporting threshold', () => {
    it('excludes results below the reporting threshold', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makeFailedResult({ name: 'error-check', severity: 'error' }),
            makeFailedResult({ name: 'recommend-check', severity: 'recommend' }),
          ],
          passed: false,
        }),
        { reportOn: 'error' },
      ).body;

      expect(output).toContain('error-check');
      expect(output).not.toContain('recommend-check');
    });

    it('reports a below-threshold failure in the counts and worst severity', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makePassedResult({ name: 'error-pass', severity: 'error' }),
            makeFailedResult({ name: 'warn-fail', severity: 'warn' }),
          ],
          passed: false,
        }),
        { reportOn: 'error' },
      ).body;

      expect(output.split('\n').at(-1)).toContain(`${FAILED_WARN} Total: 1 warning, 1 passed`);
      expect(output).not.toContain('warn-fail');
    });

    it('hides a precondition result whose severity is below the threshold', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makeSkippedResult({ name: 'precond', severity: 'recommend', skipReason: 'precondition' }),
            makeFailedResult({ name: 'error-check', severity: 'error' }),
          ],
          passed: false,
        }),
        { reportOn: 'error' },
      ).body;

      expect(output).toContain('error-check');
      expect(output).not.toContain('precond');
    });

    it('shows only skipped dependents whose severity meets the threshold', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makeSkippedResult({ name: 'high-sev-dep', severity: 'error', skipReason: 'precondition' }),
            makeSkippedResult({ name: 'low-sev-dep', severity: 'recommend', skipReason: 'precondition' }),
          ],
        }),
        { reportOn: 'warn' },
      ).body;

      expect(output).toContain('high-sev-dep');
      expect(output).not.toContain('low-sev-dep');
    });

    it('defaults reportOn to recommend, showing everything', () => {
      const output = reportRdy(
        makeReport({ results: [makePassedResult({ name: 'recommend-check', severity: 'recommend' })] }),
      ).body;

      expect(output).toContain('recommend-check');
    });
  });
});
