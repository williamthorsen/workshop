import path from 'node:path';

import { buildEdgeGraph } from '../closure/buildEdgeGraph.ts';
import type { EdgeContributor } from '../closure/EdgeContributor.ts';
import type { EdgeGraph } from '../closure/EdgeGraph.ts';
import type { SourceResolution } from '../config/foldSourceTiers.ts';
import { foldSourceTiers } from '../config/foldSourceTiers.ts';
import type { PackageLocation } from '../config/locateSourcePackages.ts';
import { locateSourcePackages } from '../config/locateSourcePackages.ts';
import type { DeployableArtifact } from '../deployment/resolveDeployedNames.ts';
import { resolveDeployedNames } from '../deployment/resolveDeployedNames.ts';
import { getEngineVersion } from '../getEngineVersion.ts';
import { hashDirectory } from '../portable/hashDirectory.ts';
import { assertRenderTargetsAreConsistent } from '../render/assertRenderTargetsAreConsistent.ts';
import type { ArtifactRender } from '../render/renderArtifact.ts';
import { renderArtifact } from '../render/renderArtifact.ts';
import { resolveCatalog } from '../resolution/resolveCatalog.ts';
import type { Catalog, CatalogEntry, ResolveKind, SourceSpec } from '../schemas/catalog-schemas.ts';
import type { CompositorConfig } from '../schemas/config-schemas.ts';
import type { EdgeRule, KindKeys } from '../schemas/edge-rule-schemas.ts';
import type { KindLayout } from '../schemas/kind-layout-schemas.ts';
import type { SourceDigest } from '../schemas/plan-schemas.ts';
import type { RenderTarget } from '../schemas/render-target-schemas.ts';
import type { ArtifactId, TargetId } from '../schemas/scalar-schemas.ts';
import type { TokenKind } from '../schemas/token-kind-schemas.ts';
import { assertTokenKindsAreConsistent } from '../tokens/assertTokenKindsAreConsistent.ts';
import type { DeployedNameLookup } from '../tokens/rewriteTokens.ts';
import type { ArtifactAsset } from './readArtifactAssets.ts';
import { readArtifactAssets } from './readArtifactAssets.ts';
import type { TargetState } from './readTargetState.ts';
import { readTargetState } from './readTargetState.ts';

/** Everything capturing a snapshot reads, declarations and config alike. */
export interface CaptureSnapshotInput {
  readonly config: CompositorConfig;
  /** Anchors a target root declared as a relative path. */
  readonly baseDir: string;
  readonly kinds: ReadonlyArray<ResolveKind>;
  readonly targets: ReadonlyArray<RenderTarget>;
  readonly tokenKinds: ReadonlyArray<TokenKind>;
  readonly edgeRules: ReadonlyArray<EdgeRule>;
  readonly kindKeys: KindKeys;
  /** Supplies the edges a body declares, which no key can state. Absent leaves the graph to frontmatter alone. */
  readonly contributeEdges?: EdgeContributor | undefined;
  /** The key path into a package's own manifest that names its content directory, such as `['compositor', 'content']`. */
  readonly contentKeyPath: ReadonlyArray<string>;
  /** Defaults to reading it. Validate turns it off, reporting authoring mistakes and planning no deployment. */
  readonly shouldReadTargetState?: boolean | undefined;
}

/**
 * Everything the flows downstream read, gathered once so that composing a plan from it touches no disk.
 *
 * `resolution` names the sources this was captured over. The catalog ranks candidates by that order and both the edge
 * graph and the render matrix read the winning candidate alone, so a config that moves the source set invalidates all
 * three and has to be captured afresh.
 *
 * `renders` is keyed by target and then by artifact, and carries a pair only where the target deploys that artifact's
 * kind. `assets` is keyed by artifact alone, the files an artifact ships beside its entry file being byte copies no
 * target transforms. `targetState` is absent where the scan was skipped.
 */
export interface CompositionSnapshot {
  readonly engineVersion: string;
  readonly locations: ReadonlyArray<PackageLocation>;
  readonly resolution: SourceResolution;
  readonly catalog: Catalog;
  readonly edgeGraph: EdgeGraph;
  readonly targets: ReadonlyArray<RenderTarget>;
  readonly tokenKinds: ReadonlyArray<TokenKind>;
  readonly assets: ReadonlyMap<ArtifactId, ReadonlyArray<ArtifactAsset>>;
  readonly renders: ReadonlyMap<TargetId, ReadonlyMap<ArtifactId, ArtifactRender>>;
  readonly sourceDigests: ReadonlyArray<SourceDigest>;
  readonly targetState?: ReadonlyArray<TargetState> | undefined;
}

/**
 * Reads everything a plan is computed from, so that computing one reads nothing.
 *
 * This is the engine's whole filesystem contact for the plan flow. The render matrix covers every artifact the catalog
 * carries rather than the ones a config happens to select, which is what makes it selection-independent: a reader
 * toggling a selection recomputes as often as it likes against one capture, and that loop is what the eager gather
 * exists to serve.
 *
 * Faults divide the way they do everywhere else in the engine. A fault in the declarations a consumer wrote throws
 * before anything is read, so a bad target or token kind is reported rather than surfacing at whichever file first
 * reached it. A permissions fault throws. A render that cannot resolve a directive travels in the matrix as the failure
 * it is, becoming a diagnostic where the plan or the validation report is assembled.
 *
 * A source digest covers a source's whole directory rather than the artifacts enumerated from it, because partials sit
 * outside that enumeration and still reach renders through transclusion.
 */
export async function captureSnapshot(input: CaptureSnapshotInput): Promise<CompositionSnapshot> {
  const { baseDir, config, kinds, targets, tokenKinds } = input;
  assertRenderTargetsAreConsistent(targets, kinds);
  assertTokenKindsAreConsistent(tokenKinds, kinds);

  const locations = await locateSourcePackages(config, { contentKeyPath: input.contentKeyPath });
  const resolution = foldSourceTiers(config, locations);
  const catalog = await resolveCatalog({ kinds, sources: resolution.sources });
  const edgeGraph = await buildEdgeGraph({
    catalog,
    rules: input.edgeRules,
    kindKeys: input.kindKeys,
    contributeEdges: input.contributeEdges,
  });

  const deployable: ReadonlyArray<DeployableArtifact> = catalog.entries.map(({ id, kindId, slug }) => ({
    id,
    kindId,
    slug,
  }));
  const resolveDeployedName = resolveDeployedNames(deployable, targets);

  const [renders, assets, sourceDigests, targetState] = await Promise.all([
    renderMatrix(catalog, targets, tokenKinds, resolveDeployedName),
    readAssets(catalog),
    digestSources(catalog.sources),
    input.shouldReadTargetState === false ? undefined : readTargetStates(targets, baseDir),
  ]);

  return {
    engineVersion: getEngineVersion(),
    locations,
    resolution,
    catalog,
    edgeGraph,
    targets: [...targets],
    tokenKinds: [...tokenKinds],
    assets,
    renders,
    sourceDigests,
    targetState,
  };
}

// region | Helpers

/** One artifact's render for one target, paired so an assembly in catalog order needs no positional lookup. */
interface MatrixEntry {
  readonly artifactId: ArtifactId;
  readonly render: ArtifactRender;
}

/** One artifact that ships files beside its entry file, with the layout locating them within its source. */
interface ShippingArtifact {
  readonly entry: CatalogEntry;
  readonly layout: Extract<KindLayout, { form: 'directory' }>;
}

/** One target's whole column of the matrix. */
interface TargetRenders {
  readonly targetId: TargetId;
  readonly renders: ReadonlyMap<ArtifactId, ArtifactRender>;
}

/**
 * Collects the artifacts whose files are worth reading, in catalog order.
 *
 * A kind laid out one file per artifact ships nothing beside it, and a kind that emits no files is walked through
 * rather than written out, so neither is read. The directory comes from the layout rather than from the entry file's
 * own path, which is what keeps this reading the artifact's whole tree where an entry file sits below its root.
 */
function collectShipping(catalog: Catalog): Array<ShippingArtifact> {
  const kinds = new Map(catalog.kinds.map((kind) => [kind.id, kind]));

  return catalog.entries.flatMap((entry) => {
    const kind = kinds.get(entry.kindId);
    if (kind === undefined || !kind.emitsFiles || kind.layout.form !== 'directory') {
      return [];
    }
    return [{ entry, layout: kind.layout }];
  });
}

/** Digests each source over its whole directory, in the precedence order the catalog carries them in. */
async function digestSources(sources: ReadonlyArray<SourceSpec>): Promise<ReadonlyArray<SourceDigest>> {
  return Promise.all(sources.map(async (source) => ({ sourceId: source.id, digest: await hashDirectory(source.dir) })));
}

/** Reads the files each artifact ships beside its entry file, keeping an artifact only where it ships something. */
async function readAssets(catalog: Catalog): Promise<ReadonlyMap<ArtifactId, ReadonlyArray<ArtifactAsset>>> {
  const sources = new Map(catalog.sources.map((source) => [source.id, source]));

  const read = await Promise.all(
    collectShipping(catalog).map(async ({ entry, layout }) => ({
      artifactId: entry.id,
      assets: await readArtifactAssets(
        path.join(requireSource(sources, entry).dir, layout.root, entry.slug),
        layout.entryFile,
      ),
    })),
  );

  return new Map(read.filter(({ assets }) => assets.length > 0).map(({ artifactId, assets }) => [artifactId, assets]));
}

/** Reads the state of every target concurrently, in the order the targets were declared. */
async function readTargetStates(
  targets: ReadonlyArray<RenderTarget>,
  baseDir: string,
): Promise<ReadonlyArray<TargetState>> {
  return Promise.all(targets.map((target) => readTargetState(target, { baseDir })));
}

/** Renders every artifact every target deploys, target by artifact. */
async function renderMatrix(
  catalog: Catalog,
  targets: ReadonlyArray<RenderTarget>,
  tokenKinds: ReadonlyArray<TokenKind>,
  resolveDeployedName: DeployedNameLookup,
): Promise<ReadonlyMap<TargetId, ReadonlyMap<ArtifactId, ArtifactRender>>> {
  const columns = await Promise.all(
    targets.map((target) => renderTarget(catalog, target, tokenKinds, resolveDeployedName)),
  );
  return new Map(columns.map(({ targetId, renders }) => [targetId, renders]));
}

/**
 * Renders one artifact for one target.
 *
 * The caller has already established that the target deploys the artifact's kind, which is what makes a name resolvable
 * and so leaves `not-deployed` unreachable from here.
 */
async function renderEntry(
  entry: CatalogEntry,
  source: SourceSpec,
  target: RenderTarget,
  tokenKinds: ReadonlyArray<TokenKind>,
  resolveDeployedName: DeployedNameLookup,
): Promise<MatrixEntry> {
  const render = await renderArtifact({
    artifact: { id: entry.id, kindId: entry.kindId, slug: entry.slug },
    entryPath: entry.resolution.winner.path,
    resolveDeployedName,
    source: { id: source.id, dir: source.dir },
    target,
    tokenKinds,
  });
  return { artifactId: entry.id, render };
}

/**
 * Renders one target's column, over the artifacts it deploys and emits files for.
 *
 * A kind the target declares no deployment for produces no file there, and a kind declaring `emitsFiles: false` exists
 * to be walked through rather than written out. Neither is rendered at all, which is what bounds the cost of covering
 * the whole catalog.
 */
async function renderTarget(
  catalog: Catalog,
  target: RenderTarget,
  tokenKinds: ReadonlyArray<TokenKind>,
  resolveDeployedName: DeployedNameLookup,
): Promise<TargetRenders> {
  const emitting = new Set(catalog.kinds.filter((kind) => kind.emitsFiles).map(({ id }) => id));
  const deployed = new Set(target.deployments.map(({ kindId }) => kindId));
  const sources = new Map(catalog.sources.map((source) => [source.id, source]));
  const entries = catalog.entries.filter((entry) => emitting.has(entry.kindId) && deployed.has(entry.kindId));

  // Entries render concurrently; the map below is built in catalog order, so the order they finish in cannot reach the
  // matrix.
  const rendered = await Promise.all(
    entries.map((entry) => renderEntry(entry, requireSource(sources, entry), target, tokenKinds, resolveDeployedName)),
  );
  return { targetId: target.id, renders: new Map(rendered.map(({ artifactId, render }) => [artifactId, render])) };
}

/** Reads the source an entry resolved from, which a catalog the engine produced always carries. */
function requireSource(sources: ReadonlyMap<string, SourceSpec>, entry: CatalogEntry): SourceSpec {
  const source = sources.get(entry.resolution.winner.sourceId);
  if (source === undefined) {
    throw new Error(
      `Catalog entry "${entry.id}" resolved from "${entry.resolution.winner.sourceId}", which it does not carry.`,
    );
  }
  return source;
}

// endregion | Helpers
