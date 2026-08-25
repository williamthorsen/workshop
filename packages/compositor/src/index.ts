export type { AppliedFile, ApplyOutcome, FileAction, PrunedDirectory } from './apply/ApplyOutcome.ts';
export type { ApplyPlanOptions } from './apply/applyPlan.ts';
export { applyPlan } from './apply/applyPlan.ts';
export { UnapplicablePlanError } from './apply/UnapplicablePlanError.ts';
export type { ClosureViolation } from './closure/assertClosureIsConsistent.ts';
export { assertClosureIsConsistent, ClosureConsistencyError } from './closure/assertClosureIsConsistent.ts';
export type { EdgeRuleViolation } from './closure/assertEdgeRulesAreConsistent.ts';
export { assertEdgeRulesAreConsistent, EdgeRuleConsistencyError } from './closure/assertEdgeRulesAreConsistent.ts';
export type { EdgeGraphInput } from './closure/buildEdgeGraph.ts';
export { buildEdgeGraph } from './closure/buildEdgeGraph.ts';
export type { ComputeClosureInput, SeedView } from './closure/computeClosure.ts';
export { computeClosure } from './closure/computeClosure.ts';
export type { ArtifactRead, EdgeContribution, EdgeContributor } from './closure/EdgeContributor.ts';
export type { EdgeGraph } from './closure/EdgeGraph.ts';
export type { SourceResolution } from './config/foldSourceTiers.ts';
export { foldSourceTiers } from './config/foldSourceTiers.ts';
export type { TierFile } from './config/loadConfig.ts';
export { loadConfig, TierFileSchema } from './config/loadConfig.ts';
export type { LocatePackageOptions } from './config/locatePackage.ts';
export { locatePackage } from './config/locatePackage.ts';
export type { LocateSourcePackagesOptions, PackageLocation } from './config/locateSourcePackages.ts';
export { locateSourcePackages } from './config/locateSourcePackages.ts';
export { resolveSources } from './config/resolveSources.ts';
export { StaleSnapshotError } from './config/StaleSnapshotError.ts';
export { ConsistencyError } from './consistency/ConsistencyError.ts';
export {
  ARTIFACT_ID_PLACEHOLDER,
  buildContributionPatterns,
  renderContributionMarkers,
} from './deployment/contribution-markers.ts';
export { invertDeployedName, renderDeployedName, SLUG_PLACEHOLDER } from './deployment/name-templates.ts';
export type { DeployableArtifact } from './deployment/resolveDeployedNames.ts';
export { resolveDeployedNames } from './deployment/resolveDeployedNames.ts';
export { resolveDeployedPath } from './deployment/resolveDeployedPath.ts';
export { mergeFrontmatter } from './frontmatter/mergeFrontmatter.ts';
export type { ParsedFrontmatter } from './frontmatter/parseFrontmatter.ts';
export { parseFrontmatter } from './frontmatter/parseFrontmatter.ts';
export type { DependencyGraphView, DependentsIndex, TraversableArtifact } from './graph/traversal.ts';
export { buildDependentsIndex, resolveInclusionPaths } from './graph/traversal.ts';
export type { BindingDiagnostic, BindingFailure, BindingRef } from './inlays/BindingDiagnostic.ts';
export type { InlayPatterns } from './inlays/buildInlayPatterns.ts';
export { buildInlayPatterns } from './inlays/buildInlayPatterns.ts';
export type { FillInlaysInput, InlayFill } from './inlays/fillInlays.ts';
export { fillInlays } from './inlays/fillInlays.ts';
export type { FindUnmatchedBindingsInput } from './inlays/findUnmatchedBindings.ts';
export { findUnmatchedBindings } from './inlays/findUnmatchedBindings.ts';
export { INLAY_NAME_PLACEHOLDER, renderInlayMarkers } from './inlays/inlay-markers.ts';
export type { InlayDiagnostic, InlayFailure } from './inlays/InlayDiagnostic.ts';
export type { InlaySite, InlayStrip } from './inlays/stripInlays.ts';
export { stripInlays } from './inlays/stripInlays.ts';
export { compileLinkPattern } from './links/compileLinkPattern.ts';
export type { LinkDiagnostic, LinkFailure, LinkRef } from './links/LinkDiagnostic.ts';
export type { LinkRewrite, RewriteLinksInput } from './links/rewriteLinks.ts';
export { rewriteLinks } from './links/rewriteLinks.ts';
export type { RegionClassification } from './ownership/classifyRegion.ts';
export { classifyRegion } from './ownership/classifyRegion.ts';
export { extractRegionContent } from './ownership/extractRegionContent.ts';
export { injectRegion } from './ownership/injectRegion.ts';
export type { OwnershipOutcome } from './ownership/OwnershipOutcome.ts';
export type { Contribution, ContributionPatterns } from './ownership/readContributions.ts';
export { readContributions } from './ownership/readContributions.ts';
export type { RegionMarkers } from './ownership/RegionMarkers.ts';
export { removeRegion } from './ownership/removeRegion.ts';
export { renderContribution } from './ownership/renderContribution.ts';
export { ensureOwnedItems } from './ownership/structured/ensureOwnedItems.ts';
export type { OwnedItemsRead } from './ownership/structured/readOwnedItems.ts';
export { readOwnedItems } from './ownership/structured/readOwnedItems.ts';
export { removeOwnedItems } from './ownership/structured/removeOwnedItems.ts';
export type { PlanViolation } from './plan/assertPlanIsConsistent.ts';
export { assertPlanIsConsistent, PlanConsistencyError } from './plan/assertPlanIsConsistent.ts';
export type { TraversalIndex } from './plan/buildTraversalIndex.ts';
export { buildTraversalIndex } from './plan/buildTraversalIndex.ts';
export { composePlan } from './plan/composePlan.ts';
export { computeFingerprint } from './plan/computeFingerprint.ts';
export type { RenderTargetViolation } from './render/assertRenderTargetsAreConsistent.ts';
export {
  assertRenderTargetsAreConsistent,
  RenderTargetConsistencyError,
} from './render/assertRenderTargetsAreConsistent.ts';
export type { ArtifactRender, RenderArtifactInput } from './render/renderArtifact.ts';
export { renderArtifact } from './render/renderArtifact.ts';
export type { RenderDiagnostic, RenderFailure } from './render/RenderDiagnostic.ts';
export type { CatalogViolation } from './resolution/assertCatalogIsConsistent.ts';
export { assertCatalogIsConsistent, CatalogConsistencyError } from './resolution/assertCatalogIsConsistent.ts';
export { composeArtifactId } from './resolution/composeArtifactId.ts';
export type { SourceArtifact } from './resolution/enumerateSource.ts';
export { enumerateSource } from './resolution/enumerateSource.ts';
export type { ResolveCatalogInput } from './resolution/resolveCatalog.ts';
export { resolveCatalog } from './resolution/resolveCatalog.ts';
export type { ArtifactResolution, ResolutionCandidate } from './schemas/artifact-resolution-schemas.ts';
export { ArtifactResolutionSchema, ResolutionCandidateSchema } from './schemas/artifact-resolution-schemas.ts';
export type { Catalog, CatalogEntry, ResolveKind, SourceSpec } from './schemas/catalog-schemas.ts';
export {
  CATALOG_SCHEMA_VERSION,
  CatalogEntrySchema,
  CatalogSchema,
  ResolveKindSchema,
  SourceSpecSchema,
} from './schemas/catalog-schemas.ts';
export type { Closure, ClosureArtifact, ClosureDiagnostic, ClosureEntryRef } from './schemas/closure-schemas.ts';
export {
  CLOSURE_SCHEMA_VERSION,
  ClosureArtifactSchema,
  ClosureDiagnosticSchema,
  ClosureEntryRefSchema,
  ClosureSchema,
} from './schemas/closure-schemas.ts';
export type { CompositorConfig, ConfigTier, TierBody } from './schemas/config-schemas.ts';
export { CompositorConfigSchema, ConfigTierSchema, TierBodySchema } from './schemas/config-schemas.ts';
export type {
  KindDescriptor,
  SourceEntry,
  SourceOrigin,
  TierDescriptor,
  TokenKindDescriptor,
} from './schemas/descriptor-schemas.ts';
export {
  KindDescriptorSchema,
  SourceEntrySchema,
  SourceOriginSchema,
  TierDescriptorSchema,
  TokenKindDescriptorSchema,
} from './schemas/descriptor-schemas.ts';
export type { EdgeRule, EdgeWildcard, FrontmatterEdgeOrigin, KindKeys } from './schemas/edge-rule-schemas.ts';
export {
  EdgeRuleSchema,
  EdgeWildcardSchema,
  FrontmatterEdgeOriginSchema,
  KindKeysSchema,
} from './schemas/edge-rule-schemas.ts';
export type {
  ArtifactContribution,
  Blob,
  FileBlock,
  FileContributors,
  FileEntry,
  FileOwnership,
  FileSide,
  OwnedCollection,
} from './schemas/file-schemas.ts';
export {
  ArtifactContributionSchema,
  BlobSchema,
  FileBlockSchema,
  FileContributorsSchema,
  FileEntrySchema,
  FileOwnershipSchema,
  FileSideSchema,
  OwnedCollectionSchema,
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
export type { KindLayout } from './schemas/kind-layout-schemas.ts';
export { KindLayoutSchema } from './schemas/kind-layout-schemas.ts';
export type { OwnedItemsDeclaration, OwnedItemsSentinel, OwnedItemsSpec } from './schemas/owned-items-schemas.ts';
export {
  OwnedItemsDeclarationSchema,
  OwnedItemsSentinelSchema,
  OwnedItemsSpecSchema,
} from './schemas/owned-items-schemas.ts';
export type { Plan, PlanFingerprint, SourceDigest, TargetDigest } from './schemas/plan-schemas.ts';
export {
  PLAN_SCHEMA_VERSION,
  PlanFingerprintSchema,
  PlanSchema,
  SourceDigestSchema,
  TargetDigestSchema,
} from './schemas/plan-schemas.ts';
export type {
  DirectiveSyntax,
  FrontmatterOverlay,
  InlayStage,
  KindDeployment,
  LineRewrite,
  MarkerPair,
  RegionKindDeployment,
  RenderStage,
  RenderTarget,
  TreeKindDeployment,
} from './schemas/render-target-schemas.ts';
export {
  DirectiveSyntaxSchema,
  FrontmatterOverlaySchema,
  KindDeploymentSchema,
  LineRewriteSchema,
  MarkerPairSchema,
  RenderStageSchema,
  RenderTargetSchema,
} from './schemas/render-target-schemas.ts';
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
export type { KindSelection, Selector } from './schemas/selection-schemas.ts';
export { KindSelectionSchema, SelectorSchema, SelectSchema } from './schemas/selection-schemas.ts';
export type { DeclaredSource, SourceDeclaration } from './schemas/source-declaration-schemas.ts';
export { DeclaredSourceSchema, SourceDeclarationSchema } from './schemas/source-declaration-schemas.ts';
export type { TargetEntry, TokenMapping, TokenMappingEntry } from './schemas/target-schemas.ts';
export { TargetEntrySchema, TokenMappingEntrySchema, TokenMappingSchema } from './schemas/target-schemas.ts';
export type { TokenKind } from './schemas/token-kind-schemas.ts';
export { TokenKindSchema } from './schemas/token-kind-schemas.ts';
export type { DeclinedArtifact, InlayBinding, SeededArtifact, Selection } from './selection/selectArtifacts.ts';
export { selectArtifacts } from './selection/selectArtifacts.ts';
export type { ConfigEntryRef, SelectionDiagnostic } from './selection/SelectionDiagnostic.ts';
export type { CaptureSnapshotInput, CompositionSnapshot } from './snapshot/captureSnapshot.ts';
export { captureSnapshot } from './snapshot/captureSnapshot.ts';
export type { ArtifactAsset } from './snapshot/readArtifactAssets.ts';
export { readArtifactAssets } from './snapshot/readArtifactAssets.ts';
export type {
  ClaimedArtifact,
  ClaimedFile,
  HostState,
  ReadTargetStateOptions,
  TargetState,
} from './snapshot/readTargetState.ts';
export { readTargetState } from './snapshot/readTargetState.ts';
export type { TokenKindViolation } from './tokens/assertTokenKindsAreConsistent.ts';
export { assertTokenKindsAreConsistent, TokenKindConsistencyError } from './tokens/assertTokenKindsAreConsistent.ts';
export { compileTokenPattern } from './tokens/compileTokenPattern.ts';
export { extractTokenEdges } from './tokens/extractTokenEdges.ts';
export type { DeployedNameLookup, RewriteTokensInput, TokenRewrite } from './tokens/rewriteTokens.ts';
export { rewriteTokens } from './tokens/rewriteTokens.ts';
export type { TokenDiagnostic, TokenFailure, TokenRef } from './tokens/TokenDiagnostic.ts';
export type { DirectivePatterns } from './transclusion/buildDirectivePatterns.ts';
export { buildDirectivePatterns } from './transclusion/buildDirectivePatterns.ts';
export { composePartialId } from './transclusion/composePartialId.ts';
export type { Segment, Transclusion, TransclusionSource } from './transclusion/expandTransclusions.ts';
export { expandTransclusions } from './transclusion/expandTransclusions.ts';
export { joinSegments } from './transclusion/joinSegments.ts';
export type {
  DirectiveRef,
  TransclusionDiagnostic,
  TransclusionFailure,
} from './transclusion/TransclusionDiagnostic.ts';
export { validateComposition } from './validate/validateComposition.ts';
export type {
  DeploymentDiagnostic,
  DeploymentRef,
  RenderRef,
  ValidationDiagnostic,
  ValidationReport,
} from './validate/ValidationDiagnostic.ts';
