import type { Catalog } from '../schemas/resolution-schemas.ts';
import type { Violation } from '../types.ts';
import { composeArtifactId } from './composeArtifactId.ts';
import { findResolutionOrderViolations } from './findResolutionOrderViolations.ts';

/** One way a catalog contradicts itself, located by a path into the payload. */
export type CatalogViolation = Violation;

/** Raised when a structurally valid catalog contradicts itself. */
export class CatalogConsistencyError extends Error {
  override readonly name = 'CatalogConsistencyError';
  readonly violations: ReadonlyArray<CatalogViolation>;

  constructor(violations: ReadonlyArray<CatalogViolation>) {
    super(`Catalog is inconsistent:\n${violations.map(({ path, message }) => `  ${path} ${message}`).join('\n')}`);
    this.violations = violations;
  }
}

/**
 * Verifies the invariants the structural schema does not carry: that every id reference resolves, that each entry's id
 * agrees with the kind and slug it names, and that shadowed candidates descend in source precedence order.
 *
 * A catalog the engine produced satisfies these by construction, so `resolveCatalog` does not call this on its own
 * output. It is for a catalog that arrived as data, which is the case a reader rendering a payload it did not compute
 * is in.
 *
 * The checks live here rather than as schema refinements because a refinement would be invisible to `z.toJSONSchema`,
 * leaving a generated JSON Schema accepting catalogs this package rejects.
 *
 * Every violation is collected before throwing, so one run reports all of them.
 */
export function assertCatalogIsConsistent(catalog: Catalog): void {
  const violations = [
    ...findDuplicateIds(catalog),
    ...findDanglingReferences(catalog),
    ...findIdDisagreements(catalog),
    ...findRepeatedCandidateSources(catalog),
    ...findCatalogResolutionOrderViolations(catalog),
  ];

  if (violations.length > 0) {
    throw new CatalogConsistencyError(violations);
  }
}

// region | Helpers

/** The id of every entry in a table. */
function collectIds(entries: ReadonlyArray<{ id: string }>): ReadonlySet<string> {
  return new Set(entries.map((entry) => entry.id));
}

/** Violations for each artifact whose shadowed candidates contradict source precedence. */
function findCatalogResolutionOrderViolations(catalog: Catalog): Array<CatalogViolation> {
  const entries = catalog.entries.map((entry, index) => ({
    basePath: `entries[${index}].resolution`,
    resolution: entry.resolution,
  }));
  return findResolutionOrderViolations(entries, catalog.sources);
}

/** Violations for each id reference that names no entry in the table it points at. */
function findDanglingReferences(catalog: Catalog): Array<CatalogViolation> {
  const kindIds = collectIds(catalog.kinds);
  const sourceIds = collectIds(catalog.sources);

  const violations: Array<CatalogViolation> = [];
  const requireKnown = (known: ReadonlySet<string>, id: string, path: string, table: string): void => {
    if (!known.has(id)) {
      violations.push({ path, message: `references "${id}", which is not an entry in ${table}` });
    }
  };

  for (const [index, entry] of catalog.entries.entries()) {
    const at = `entries[${index}]`;
    requireKnown(kindIds, entry.kindId, `${at}.kindId`, 'kinds');
    requireKnown(sourceIds, entry.resolution.winner.sourceId, `${at}.resolution.winner.sourceId`, 'sources');
    for (const [loserIndex, loser] of entry.resolution.shadowed.entries()) {
      const path = `${at}.resolution.shadowed[${loserIndex}].sourceId`;
      requireKnown(sourceIds, loser.sourceId, path, 'sources');
    }
  }

  return violations;
}

/** Violations for each table carrying the same id twice, which would make every reference to it ambiguous. */
function findDuplicateIds(catalog: Catalog): Array<CatalogViolation> {
  const tables = [
    ['entries', catalog.entries],
    ['kinds', catalog.kinds],
    ['sources', catalog.sources],
  ] as const;

  return tables.flatMap(([name, entries]) => {
    const seen = new Set<string>();
    const repeated = new Set<string>();
    for (const { id } of entries) {
      if (seen.has(id)) {
        repeated.add(id);
      }
      seen.add(id);
    }
    return [...repeated].map((id) => ({ path: name, message: `carries "${id}" more than once` }));
  });
}

/**
 * Violations for each entry whose id is not composed from the kind and slug beside it.
 *
 * The composition is what lets a plan artifact's id address a catalog entry, so an entry that departs from it is
 * unreachable from the plan describing the same artifact. Checking it also rules out two entries describing one
 * artifact, which unique ids alone would allow.
 */
function findIdDisagreements(catalog: Catalog): Array<CatalogViolation> {
  const violations: Array<CatalogViolation> = [];
  for (const [index, entry] of catalog.entries.entries()) {
    const expected = composeArtifactId(entry.kindId, entry.slug);
    if (entry.id !== expected) {
      violations.push({
        path: `entries[${index}].id`,
        message: `is "${entry.id}", and the kind and slug beside it compose "${expected}"`,
      });
    }
  }
  return violations;
}

/**
 * Violations for each entry naming one source more than once among its candidates.
 *
 * A source carries an artifact at one path, so it either wins resolution or loses it. Appearing twice would let one
 * source both shadow and be shadowed by itself, and would render a source explaining its own defeat.
 */
function findRepeatedCandidateSources(catalog: Catalog): Array<CatalogViolation> {
  const violations: Array<CatalogViolation> = [];
  for (const [index, entry] of catalog.entries.entries()) {
    const seen = new Set([entry.resolution.winner.sourceId]);
    for (const [loserIndex, loser] of entry.resolution.shadowed.entries()) {
      if (seen.has(loser.sourceId)) {
        violations.push({
          path: `entries[${index}].resolution.shadowed[${loserIndex}].sourceId`,
          message: `repeats "${loser.sourceId}", which already carries this artifact`,
        });
      }
      seen.add(loser.sourceId);
    }
  }
  return violations;
}

// endregion | Helpers
