import type { Violation } from './Violation.ts';

/** One id-keyed table to check, with the name a violation against it is reported under. */
export type IdTable = readonly [name: string, entries: ReadonlyArray<{ id: string }>];

/**
 * Reports each id a table carries twice, which would make every reference to it ambiguous.
 *
 * Shared by the plan and catalog assertions, which apply the same rule and differ only in which tables they carry.
 * Violations follow the order of `tables`, so the caller's list decides the order they are reported in.
 */
export function findDuplicateIds(tables: ReadonlyArray<IdTable>): Array<Violation> {
  return tables.flatMap(([name, entries]) => {
    const seen = new Set<string>();
    const repeated = new Set<string>();
    for (const { id } of entries) {
      if (seen.has(id)) {
        repeated.add(id);
      }
      seen.add(id);
    }
    return [...repeated].map((id) => ({ path: name, message: `lists "${id}" more than once` }));
  });
}
