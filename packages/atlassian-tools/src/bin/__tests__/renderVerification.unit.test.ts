import type { BoardColumnReport, VerificationReport } from '@williamthorsen/toolbelt.atlassian/candidate';
import { describe, expect, it } from 'vitest';

import { renderVerification } from '../renderVerification.ts';

describe(renderVerification, () => {
  it('marks a status that the server has as the spec declares it', () => {
    const rendered = renderVerification(
      buildReport({ statuses: [{ category: 'TODO', matches: true, name: 'To Do', transition: 'To Do' }] }),
      buildColumns(),
    );

    expect(rendered).toContain("  ok   To Do (TODO), transition 'To Do'");
  });

  it('marks a status missing from the server, naming what is absent', () => {
    const rendered = renderVerification(
      buildReport({
        matches: false,
        statuses: [{ category: undefined, matches: false, name: 'Waiting', transition: undefined }],
      }),
      buildColumns(),
    );

    expect(rendered).toContain("  MISS Waiting (absent), transition 'absent'");
  });

  it('reports each board feature against the state requested by the spec', () => {
    const rendered = renderVerification(
      buildReport({
        features: [
          { feature: 'jsw.agility.backlog', locked: false, matches: true, state: 'ENABLED' },
          { feature: 'jsw.agility.sprints', locked: false, matches: false, state: undefined },
        ],
      }),
      buildColumns(),
    );

    expect(rendered).toContain('  ok   jsw.agility.backlog = ENABLED');
    expect(rendered).toContain('  MISS jsw.agility.sprints = absent');
  });

  it('marks a feature locked by Jira as neither met nor faulted', () => {
    const rendered = renderVerification(
      buildReport({
        features: [{ feature: 'jsw.agility.goals', locked: true, matches: false, state: 'DISABLED' }],
      }),
      buildColumns(),
    );

    expect(rendered).toContain('  LOCK jsw.agility.goals = DISABLED, which Jira has locked and the API cannot set');
    expect(rendered).not.toContain('MISS jsw.agility.goals');
  });

  it('lists the board columns', () => {
    expect(renderVerification(buildReport(), buildColumns())).toContain('columns   To Do | In Progress | Done');
  });

  it('names a status mapped to no column and the consequence', () => {
    const rendered = renderVerification(buildReport(), buildColumns({ uncovered: ['Waiting'] }));

    expect(rendered).toContain("columns   'Waiting' map to no column, so their work items appear only in search;");
    expect(rendered).toContain('\n          add a column for each in the board settings');
  });

  it('reports a column order differing from the spec', () => {
    const rendered = renderVerification(
      buildReport(),
      buildColumns({ order: { actual: ['Done', 'To Do'], expected: ['To Do', 'Done'] } }),
    );

    expect(rendered).toContain('columns   order differs from the spec (To Do | Done);');
    expect(rendered).toContain('\n          reorder by dragging in the board settings');
  });

  it('says nothing about column order when the columns of the board already follow the spec order', () => {
    expect(renderVerification(buildReport(), buildColumns())).not.toContain('order differs');
  });
});

// region | Helpers

/** Builds a report of three columns that cover the spec in order, with the overrides that a test needs. */
function buildColumns(overrides: Partial<BoardColumnReport> = {}): BoardColumnReport {
  return { columns: ['To Do', 'In Progress', 'Done'], order: undefined, uncovered: [], ...overrides };
}

/** Builds a matching verification report with no entries, with the overrides that a test needs. */
function buildReport(overrides: Partial<VerificationReport> = {}): VerificationReport {
  return { features: [], matches: true, statuses: [], ...overrides };
}

// endregion | Helpers
