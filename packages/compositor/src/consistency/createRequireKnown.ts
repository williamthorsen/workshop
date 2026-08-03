import type { Violation } from './Violation.ts';

/** A recorder for id references naming no entry in the table they point at. */
export type RequireKnown = (known: ReadonlySet<string>, id: string | undefined, path: string, table: string) => void;

/**
 * Creates a recorder appending to `violations`.
 *
 * Shared by the plan and catalog dangling-reference checks, which walk different documents but apply one rule. The
 * accumulator stays with the traversal so a check still returns its own violations; only the rule is shared.
 *
 * An absent id resolves vacuously, so a reference the schema leaves optional needs no guard at its call site.
 */
export function createRequireKnown(violations: Array<Violation>): RequireKnown {
  return (known, id, path, table) => {
    if (id !== undefined && !known.has(id)) {
      violations.push({ path, message: `references "${id}", which is not an entry in ${table}` });
    }
  };
}
