/**
 * The states by which `issue list` selects work items, named as `gh issue list` names them.
 *
 * @internal
 */
export const ISSUE_STATES = ['all', 'closed', 'open'] as const;

export type IssueState = (typeof ISSUE_STATES)[number];

/** The predicates of a listing, each of which contributes at most one clause. */
export interface IssueListQuery {
  readonly projectKey: string;
  readonly state: IssueState;
}

/** Builds each predicate's clause, or `undefined` when the predicate does not restrict the listing. */
const CLAUSE_BUILDERS: ReadonlyArray<(query: IssueListQuery) => string | undefined> = [
  ({ projectKey }) => `project = ${quoteJqlValue(projectKey)}`,
  ({ state }) => STATE_CLAUSES[state],
];

const STATE_CLAUSES: Readonly<Record<IssueState, string | undefined>> = {
  all: undefined,
  closed: 'statusCategory = Done',
  open: 'statusCategory != Done',
};

/**
 * Composes the JQL for a listing, joining each predicate's clause and ordering the newest work items first.
 *
 * @internal
 */
export function composeIssueListJql(query: IssueListQuery): string {
  const clauses = CLAUSE_BUILDERS.flatMap((build) => build(query) ?? []);

  return `${clauses.join(' AND ')} ORDER BY created DESC`;
}

// region | Helpers

/** Quotes a value as a JQL string, escaping the characters that would end or escape it. */
function quoteJqlValue(value: string): string {
  return `"${value.replaceAll(/["\\]/g, (character) => `\\${character}`)}"`;
}

// endregion | Helpers
