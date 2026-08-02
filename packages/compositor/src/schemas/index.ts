// Shared building blocks
export type { ArtifactId, DiffStatus, Hash, Id, KindId, PartialId, SourceId, TargetId } from './common.ts';
export { DiffStatusSchema, HashSchema, IdSchema } from './common.ts';

// Descriptors: the kinds, sources, and targets a plan is computed over
export type {
  KindDescriptor,
  SourceEntry,
  SourceOrigin,
  TargetEntry,
  TargetVariable,
  TokenMapping,
  TokenMappingEntry,
} from './descriptor-schemas.ts';
export {
  KindDescriptorSchema,
  SourceEntrySchema,
  SourceOriginSchema,
  TargetEntrySchema,
  TargetVariableSchema,
  TokenMappingEntrySchema,
  TokenMappingSchema,
} from './descriptor-schemas.ts';

// Resolution: what the sources carry, and which one won each artifact
export type { Catalog, CatalogEntry, KindLayout, ResolveKind, SourceSpec } from './resolution-schemas.ts';
export {
  CATALOG_SCHEMA_VERSION,
  CatalogEntrySchema,
  CatalogSchema,
  KindLayoutSchema,
  ResolveKindSchema,
  SourceSpecSchema,
} from './resolution-schemas.ts';

// Graph: artifacts, partials, and the edges between them
export type {
  ArtifactEntry,
  ArtifactResolution,
  DependencyEdge,
  EdgeOrigin,
  PartialEntry,
  PresentArtifact,
  RemovedArtifact,
  ResolutionCandidate,
  SeedOrigin,
} from './graph-schemas.ts';
export {
  ArtifactEntrySchema,
  ArtifactResolutionSchema,
  DependencyEdgeSchema,
  EdgeOriginSchema,
  PartialEntrySchema,
  PresentArtifactSchema,
  RemovedArtifactSchema,
  ResolutionCandidateSchema,
  SeedOriginSchema,
} from './graph-schemas.ts';

// Files: rendered output, ownership, and content
export type {
  ArtifactContribution,
  Blob,
  FileBlock,
  FileContributors,
  FileEntry,
  FileOwnership,
  FileSide,
} from './file-schemas.ts';
export {
  ArtifactContributionSchema,
  BlobSchema,
  FileBlockSchema,
  FileContributorsSchema,
  FileEntrySchema,
  FileOwnershipSchema,
  FileSideSchema,
} from './file-schemas.ts';

// Plan envelope
export type { Plan, PlanFingerprint, SourceDigest, TargetDigest } from './plan-schema.ts';
export {
  PLAN_SCHEMA_VERSION,
  PlanFingerprintSchema,
  PlanSchema,
  SourceDigestSchema,
  TargetDigestSchema,
} from './plan-schema.ts';
