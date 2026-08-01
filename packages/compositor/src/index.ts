export type { CatalogViolation } from './assertCatalogIsConsistent.ts';
export { assertCatalogIsConsistent, CatalogConsistencyError } from './assertCatalogIsConsistent.ts';
export type { PlanViolation } from './assertPlanIsConsistent.ts';
export { assertPlanIsConsistent, PlanConsistencyError } from './assertPlanIsConsistent.ts';
export { composeArtifactId } from './composeArtifactId.ts';
export * from './schemas/index.ts';
export type { TraversalIndex } from './traversal.ts';
export { buildTraversalIndex, resolveInclusionPaths } from './traversal.ts';
