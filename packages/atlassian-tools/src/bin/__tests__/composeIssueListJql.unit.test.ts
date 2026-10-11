import { describe, expect, it } from 'vitest';

import { composeIssueListJql } from '../composeIssueListJql.ts';

describe(composeIssueListJql, () => {
  it('lists the open work items of a project, newest first', () => {
    expect(composeIssueListJql({ projectKey: 'PROJ', state: 'open' })).toBe(
      'project = "PROJ" AND statusCategory != Done ORDER BY created DESC',
    );
  });

  it('keeps only the Done status category for closed work items', () => {
    expect(composeIssueListJql({ projectKey: 'PROJ', state: 'closed' })).toBe(
      'project = "PROJ" AND statusCategory = Done ORDER BY created DESC',
    );
  });

  it('applies no status clause for all work items', () => {
    expect(composeIssueListJql({ projectKey: 'PROJ', state: 'all' })).toBe('project = "PROJ" ORDER BY created DESC');
  });

  it('escapes a quote or backslash in a value rather than ending the string', () => {
    expect(composeIssueListJql({ projectKey: String.raw`A"B\C`, state: 'all' })).toBe(
      String.raw`project = "A\"B\\C" ORDER BY created DESC`,
    );
  });
});
