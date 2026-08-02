import type { IdTable } from '../../consistency/findDuplicateIds.ts';
import type { Catalog } from '../../schemas/resolution-schemas.ts';

/**
 * Collects the catalog's id-keyed tables, in the order a violation against them is reported.
 *
 * Reordering reorders the reported violations, and dropping a table stops the duplicate-id check from covering it.
 */
export function collectIdTables(catalog: Catalog): ReadonlyArray<IdTable> {
  return [
    ['entries', catalog.entries],
    ['kinds', catalog.kinds],
    ['sources', catalog.sources],
  ];
}
