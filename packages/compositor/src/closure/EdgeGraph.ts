import type { Catalog } from '../schemas/catalog-schemas.ts';
import type { ClosureDiagnostic } from '../schemas/closure-schemas.ts';
import type { DependencyEdge, PartialEntry } from '../schemas/graph-schemas.ts';
import type { ArtifactId } from '../schemas/scalar-schemas.ts';

/**
 * Every edge the catalog's artifacts declare, read once so that walking them touches no disk.
 *
 * Built from a catalog and nothing else, which is what makes it stable across config changes: a consumer holds one of
 * these and recomputes as many closures from it as a reader toggles selections, none of them reading a file.
 *
 * `edges` carries an artifact only when it declares one, so an absent key and an empty list mean the same thing and
 * neither has to be written. `diagnostics` covers faults found while reading, whichever artifact a later selection
 * turns out to reach; a closure carries the subset that concerns the artifacts it holds.
 */
export interface EdgeGraph {
  readonly catalog: Catalog;
  readonly edges: ReadonlyMap<ArtifactId, ReadonlyArray<DependencyEdge>>;
  readonly partials: ReadonlyArray<PartialEntry>;
  readonly diagnostics: ReadonlyArray<ClosureDiagnostic>;
}
