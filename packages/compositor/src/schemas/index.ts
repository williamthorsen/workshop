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
} from './descriptorSchemas.ts';
export {
  KindDescriptorSchema,
  SourceEntrySchema,
  SourceOriginSchema,
  TargetEntrySchema,
  TargetVariableSchema,
  TokenMappingEntrySchema,
  TokenMappingSchema,
} from './descriptorSchemas.ts';

// Resolution: what the sources carry, and which one won each artifact
export type { Catalog, CatalogEntry, KindLayout, ResolveKind, SourceSpec } from './resolutionSchemas.ts';
export {
  CATALOG_SCHEMA_VERSION,
  CatalogEntrySchema,
  CatalogSchema,
  KindLayoutSchema,
  ResolveKindSchema,
  SourceSpecSchema,
} from './resolutionSchemas.ts';

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
} from './graphSchemas.ts';
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
} from './graphSchemas.ts';

// Files: rendered output, ownership, and content
export type {
  ArtifactContribution,
  Blob,
  FileBlock,
  FileContributors,
  FileEntry,
  FileOwnership,
  FileSide,
} from './fileSchemas.ts';
export {
  ArtifactContributionSchema,
  BlobSchema,
  FileBlockSchema,
  FileContributorsSchema,
  FileEntrySchema,
  FileOwnershipSchema,
  FileSideSchema,
} from './fileSchemas.ts';

// Plan envelope
export type { Plan, PlanFingerprint, SourceDigest, TargetDigest } from './planSchema.ts';
export {
  PLAN_SCHEMA_VERSION,
  PlanFingerprintSchema,
  PlanSchema,
  SourceDigestSchema,
  TargetDigestSchema,
} from './planSchema.ts';
