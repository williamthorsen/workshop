import { listDuplicateItems } from '@williamthorsen/toolbelt.arrays/candidate';

import type { Violation } from './Violation.ts';

/** One id-keyed table to check, with the name a violation against it is reported under. */
export type IdTable = readonly [name: string, entries: ReadonlyArray<{ id: string }>];

/**
 * Reports each id a table lists twice, which would make every reference to it ambiguous.
 *
 * Shared by the plan and catalog assertions, which apply the same rule and differ only in which tables they contain.
 * Violations follow the order of `tables`, so the caller's list decides the order they are reported in.
 */
export function findDuplicateIds(tables: ReadonlyArray<IdTable>): Array<Violation> {
  return tables.flatMap(([name, entries]) =>
    listDuplicateItems(entries.map(({ id }) => id)).map((id) => ({
      path: name,
      message: `lists "${id}" more than once`,
    })),
  );
}
