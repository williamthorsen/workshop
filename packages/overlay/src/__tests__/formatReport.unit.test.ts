import { describe, expect, it } from 'vitest';

import { formatReport } from '../formatReport.ts';
import type { OverlayResult } from '../types.ts';

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

describe(formatReport, () => {
  it('reports a converged target under verify', () => {
    const report = formatReport(buildResult({ mode: 'verify' }));

    expect(report).toContain('Target is converged: no drift.');
  });

  it('lists drift entries and a drift count under verify', () => {
    const report = formatReport(
      buildResult({
        mode: 'verify',
        entries: [
          { path: '.new', outcome: 'created' },
          { path: '.diff', outcome: 'conflict' },
        ],
        counts: { created: 0, deleted: 0, forced: 0, conflicts: 0, pending: 2 },
        exitCode: 1,
      }),
    );

    expect(report).toContain('.new');
    expect(report).toContain('.diff');
    expect(report).toContain('Drift: 2 entries.');
  });

  it('phrases pending scripts as "would run" under verify', () => {
    const report = formatReport(buildResult({ mode: 'verify', scripts: { ran: 2, ok: true } }));

    expect(report).toContain('2 scripts would run.');
  });

  it('phrases executed scripts as "ran" under create', () => {
    const report = formatReport(buildResult({ mode: 'create', scripts: { ran: 1, ok: true } }));

    expect(report).toContain('1 script ran.');
  });

  it('summarizes action counts under create', () => {
    const report = formatReport(
      buildResult({
        mode: 'create',
        counts: { created: 2, deleted: 1, forced: 0, conflicts: 1, pending: 0 },
        exitCode: 1,
      }),
    );

    expect(report).toContain('2 created, 1 deleted, 0 forced, 1 conflict.');
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
