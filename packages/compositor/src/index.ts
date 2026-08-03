export type { TierFile } from './config/loadConfig.ts';
export { loadConfig, TierFileSchema } from './config/loadConfig.ts';
export type { LocatePackageOptions } from './config/locatePackage.ts';
export { locatePackage } from './config/locatePackage.ts';
export type { ResolveSourcesOptions, SourceResolution } from './config/resolveSources.ts';
export { resolveSources } from './config/resolveSources.ts';
export { ConsistencyError } from './consistency/ConsistencyError.ts';
export type { DependencyGraphView, DependentsIndex, TraversableArtifact } from './graph/traversal.ts';
export { buildDependentsIndex, resolveInclusionPaths } from './graph/traversal.ts';
export type { PlanViolation } from './plan/assertPlanIsConsistent.ts';
export { assertPlanIsConsistent, PlanConsistencyError } from './plan/assertPlanIsConsistent.ts';
export type { TraversalIndex } from './plan/traversal.ts';
export { buildTraversalIndex } from './plan/traversal.ts';
export type { CatalogViolation } from './resolution/assertCatalogIsConsistent.ts';
export { assertCatalogIsConsistent, CatalogConsistencyError } from './resolution/assertCatalogIsConsistent.ts';
export { composeArtifactId } from './resolution/composeArtifactId.ts';
export type { SourceArtifact } from './resolution/enumerateSource.ts';
export { enumerateSource } from './resolution/enumerateSource.ts';
export type { ResolveCatalogInput } from './resolution/resolveCatalog.ts';
export { resolveCatalog } from './resolution/resolveCatalog.ts';
export type { ArtifactResolution, ResolutionCandidate } from './schemas/artifact-resolution-schemas.ts';
export { ArtifactResolutionSchema, ResolutionCandidateSchema } from './schemas/artifact-resolution-schemas.ts';
export type { Catalog, CatalogEntry, KindLayout, ResolveKind, SourceSpec } from './schemas/catalog-schemas.ts';
export {
  CATALOG_SCHEMA_VERSION,
  CatalogEntrySchema,
  CatalogSchema,
  KindLayoutSchema,
  ResolveKindSchema,
  SourceSpecSchema,
} from './schemas/catalog-schemas.ts';
export type {
  CompositorConfig,
  ConfigTier,
  DeclaredSource,
  KindSelection,
  Selector,
  SourceDeclaration,
  TierBody,
} from './schemas/config-schemas.ts';
export {
  CompositorConfigSchema,
  ConfigTierSchema,
  DeclaredSourceSchema,
  KindSelectionSchema,
  SelectorSchema,
  SelectSchema,
  SourceDeclarationSchema,
  TierBodySchema,
} from './schemas/config-schemas.ts';
export type {
  KindDescriptor,
  SourceEntry,
  SourceOrigin,
  TargetEntry,
  TargetVariable,
  TierDescriptor,
  TokenMapping,
  TokenMappingEntry,
} from './schemas/descriptor-schemas.ts';
export {
  KindDescriptorSchema,
  SourceEntrySchema,
  SourceOriginSchema,
  TargetEntrySchema,
  TargetVariableSchema,
  TierDescriptorSchema,
  TokenMappingEntrySchema,
  TokenMappingSchema,
} from './schemas/descriptor-schemas.ts';
export type {
  ArtifactContribution,
  Blob,
  FileBlock,
  FileContributors,
  FileEntry,
  FileOwnership,
  FileSide,
} from './schemas/file-schemas.ts';
export {
  ArtifactContributionSchema,
  BlobSchema,
  FileBlockSchema,
  FileContributorsSchema,
  FileEntrySchema,
  FileOwnershipSchema,
  FileSideSchema,
} from './schemas/file-schemas.ts';
export type {
  ArtifactEntry,
  DependencyEdge,
  EdgeOrigin,
  PartialEntry,
  PresentArtifact,
  RemovedArtifact,
  Seed,
  SeedOrigin,
} from './schemas/graph-schemas.ts';
export {
  ArtifactEntrySchema,
  DependencyEdgeSchema,
  EdgeOriginSchema,
  PartialEntrySchema,
  PresentArtifactSchema,
  RemovedArtifactSchema,
  SeedOriginSchema,
  SeedSchema,
} from './schemas/graph-schemas.ts';
export type { Plan, PlanFingerprint, SourceDigest, TargetDigest } from './schemas/plan-schemas.ts';
export {
  PLAN_SCHEMA_VERSION,
  PlanFingerprintSchema,
  PlanSchema,
  SourceDigestSchema,
  TargetDigestSchema,
} from './schemas/plan-schemas.ts';
export type {
  ArtifactId,
  DiffStatus,
  Hash,
  Id,
  KindId,
  PartialId,
  SourceId,
  TargetId,
} from './schemas/scalar-schemas.ts';
export { DiffStatusSchema, HashSchema, IdSchema } from './schemas/scalar-schemas.ts';
export type { DeclinedArtifact, SeededArtifact, Selection } from './selection/selectArtifacts.ts';
export { selectArtifacts } from './selection/selectArtifacts.ts';
export type { ConfigEntryRef, SelectionDiagnostic } from './selection/SelectionDiagnostic.ts';
