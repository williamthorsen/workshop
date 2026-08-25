import { describe, expect, it } from 'vitest';

import type { OverlayResult } from '../../modes/types.ts';
import { formatReport } from '../formatReport.ts';

describe(formatReport, () => {
  it('reports a converged target under verify', () => {
    const report = formatReport(buildResult({ mode: 'verify' }));

    expect(report).toContain('Target is converged: no drift.');
  });

  it('lists drift entries and a drift count under verify', () => {
    const report = formatReport(buildDriftResult());

    expect(report).toContain('would create   .new');
    expect(report).toContain('would conflict .diff');
    expect(report).toContain('Drift: 2 entries.');
  });

  it('phrases every entry as a preview under verify', () => {
    const report = formatReport(
      buildResult({
        mode: 'verify',
        entries: [
          { path: '.new', outcome: 'created' },
          { path: '.gone', outcome: 'deleted' },
        ],
        counts: { created: 0, deleted: 0, forced: 0, conflicts: 0, pending: 2 },
        exitCode: 1,
      }),
    );

    expect(report).toContain('would create .new');
    expect(report).toContain('would delete .gone');
  });

  it('phrases every entry as a resulting state under create', () => {
    const report = formatReport(
      buildResult({
        mode: 'create',
        entries: [
          { path: '.new', outcome: 'created' },
          { path: '.diff', outcome: 'conflict' },
        ],
        counts: { created: 1, deleted: 0, forced: 0, conflicts: 1, pending: 0 },
        exitCode: 1,
      }),
    );

    expect(report).toContain('created  .new');
    expect(report).toContain('conflict .diff');
    expect(report).not.toContain('would ');
  });

  it('phrases an overwritten entry as a resulting state under force', () => {
    const report = formatReport(
      buildResult({
        mode: 'force',
        entries: [{ path: '.diff', outcome: 'forced' }],
        counts: { created: 0, deleted: 0, forced: 1, conflicts: 0, pending: 0 },
      }),
    );

    expect(report).toContain('overwritten .diff');
  });

  it('pads labels to the widest one present so the paths align', () => {
    const report = formatReport(buildDriftResult());

    const columns = report
      .split('\n')
      .filter((line) => line.startsWith('  '))
      .map((line) => line.indexOf('.'));

    expect(new Set(columns).size).toBe(1);
  });

  it('phrases pending scripts as "would run" under verify', () => {
    const report = formatReport(buildResult({ mode: 'verify', scripts: { ran: 2, ok: true } }));

    expect(report).toContain('2 scripts would run.');
  });

  it('phrases executed scripts as "ran" under create', () => {
    const report = formatReport(buildResult({ mode: 'create', scripts: { ran: 1, ok: true } }));

    expect(report).toContain('1 script ran.');
  });

  it('summarizes only non-zero action counts under create', () => {
    const report = formatReport(
      buildResult({
        mode: 'create',
        counts: { created: 2, deleted: 1, forced: 0, conflicts: 1, pending: 0 },
        exitCode: 1,
      }),
    );

    expect(report).toContain('2 created, 1 deleted, 1 conflict.');
  });

  it('reports "Nothing to do." when every action count is zero under create', () => {
    const report = formatReport(buildResult({ mode: 'create' }));

    expect(report).toContain('Nothing to do.');
  });

  it('includes a --force fix-it hint when conflicts exist', () => {
    const report = formatReport(
      buildResult({
        mode: 'create',
        entries: [{ path: '.diff', outcome: 'conflict' }],
        counts: { created: 0, deleted: 0, forced: 0, conflicts: 1, pending: 0 },
        exitCode: 1,
      }),
    );

    expect(report).toContain('overlay --force');
  });

  it('includes a conditional fix-it hint when a verify run reports a differing file', () => {
    const report = formatReport(
      buildResult({
        mode: 'verify',
        entries: [{ path: '.diff', outcome: 'conflict' }],
        counts: { created: 0, deleted: 0, forced: 0, conflicts: 0, pending: 1 },
        exitCode: 1,
      }),
    );

    expect(report).toContain('would be left untouched by `--create`');
    expect(report).toContain('overlay --force');
  });

  it('omits the fix-it hint when there are no conflicts', () => {
    const report = formatReport(
      buildResult({ mode: 'force', counts: { created: 1, deleted: 0, forced: 0, conflicts: 0, pending: 0 } }),
    );

    expect(report).not.toContain('overlay --force');
  });

  it('notes a script failure in the scripts summary', () => {
    const report = formatReport(buildResult({ mode: 'force', scripts: { ran: 1, ok: false }, exitCode: 2 }));

    expect(report).toContain('a script failed');
  });
});

// region | Helpers

/** Builds a verify result holding one addition and one differing file. */
function buildDriftResult(): OverlayResult {
  return buildResult({
    mode: 'verify',
    entries: [
      { path: '.new', outcome: 'created' },
      { path: '.diff', outcome: 'conflict' },
    ],
    counts: { created: 0, deleted: 0, forced: 0, conflicts: 0, pending: 2 },
    exitCode: 1,
  });
}

/** Builds an `OverlayResult` from a converged-verify baseline, applying the given overrides. */
function buildResult(overrides: Partial<OverlayResult>): OverlayResult {
  return {
    mode: 'verify',
    entries: [],
    scripts: { ran: 0, ok: true },
    counts: { created: 0, deleted: 0, forced: 0, conflicts: 0, pending: 0 },
    exitCode: 0,
    ...overrides,
  };
}

// endregion | Helpers
