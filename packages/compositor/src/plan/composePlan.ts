import { computeClosure } from '../closure/computeClosure.ts';
import { compareStrings } from '../portable/compareStrings.ts';
import type { BlobStore } from '../portable/createBlobStore.ts';
import { createBlobStore } from '../portable/createBlobStore.ts';
import type { CompositorConfig } from '../schemas/config-schemas.ts';
import type { Blob, FileEntry } from '../schemas/file-schemas.ts';
import type { PartialEntry } from '../schemas/graph-schemas.ts';
import type { Plan } from '../schemas/plan-schemas.ts';
import { PLAN_SCHEMA_VERSION } from '../schemas/plan-schemas.ts';
import type { RenderTarget } from '../schemas/render-target-schemas.ts';
import type { Hash, Id, PartialId } from '../schemas/scalar-schemas.ts';
import type { TargetEntry } from '../schemas/target-schemas.ts';
import { selectArtifacts } from '../selection/selectArtifacts.ts';
import type { CompositionSnapshot } from '../snapshot/captureSnapshot.ts';
import { assembleFiles } from './compose/assembleFiles.ts';
import { assertSnapshotFits } from './compose/assertSnapshotFits.ts';
import { classifyArtifacts } from './compose/classifyArtifacts.ts';
import { computeFingerprint } from './computeFingerprint.ts';

/**
 * Composes the plan a config implies over a snapshot: the whole rendered result, and how it differs from what is there.
 *
 * Pure and synchronous. No filesystem import reaches this module's graph, which is what makes What-if the same call
 * with an edited config: a reader toggles a selection and replans against one capture as often as it likes, and the
 * workspace the snapshot was taken over may be gone by then.
 *
 * What an edited config may move against one snapshot is a selection. A config whose adopted sources have moved is
 * refused rather than composed against a catalog that no longer describes it, as is a snapshot captured without the
 * target state a diff is measured against.
 *
 * Ordering is part of the contract the payload states: id-keyed tables run lexicographically, `sources` and `tiers` in
 * the orders their positions encode, `files` by target and then path, and `blobs` by hash.
 */
export function composePlan(config: CompositorConfig, snapshot: CompositionSnapshot): Plan {
  assertSnapshotFits(config, snapshot);

  const tiers = config.tiers.map(({ id, label }) => ({ id, label }));
  const selection = selectArtifacts(config, snapshot.catalog);
  const closure = computeClosure({ graph: snapshot.edgeGraph, selection, tiers });

  const blobs = createBlobStore();
  const assembly = assembleFiles({ snapshot, artifacts: closure.artifacts, blobs, bindings: selection.bindings });
  const partials = collectPartials(closure.partials, assembly.files, snapshot);

  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    engineVersion: snapshot.engineVersion,
    contentAvailability: 'complete',
    fingerprint: computeFingerprint(config, snapshot),
    kinds: sortById(snapshot.catalog.kinds.map(({ id, label, emitsFiles }) => ({ id, label, emitsFiles }))),
    sources: snapshot.catalog.sources.map(({ id, name, origin }) => ({ id, name, origin })),
    targets: sortById(snapshot.targets.map(toTargetEntry)),
    tiers,
    tokenKinds: sortById(snapshot.tokenKinds.map(({ id, label }) => ({ id, label }))),
    artifacts: classifyArtifacts({
      artifacts: closure.artifacts,
      verdicts: assembly.verdicts,
      departed: assembly.departed,
      resolutions: new Map(snapshot.catalog.entries.map(({ id, resolution }) => [id, resolution])),
      edges: snapshot.edgeGraph.edges,
      partialIds: new Set(partials.map(({ id }) => id)),
    }),
    partials,
    files: [...assembly.files],
    blobs: collectBlobs(assembly.files, blobs),
  };
}

// region | Helpers

/**
 * Collects the bodies the plan's files name, leaving behind whatever was registered for a destination none names.
 *
 * A body is registered as its destination is planned, and a destination can still be discarded afterwards: a contested
 * one collapses into a single blocked entry naming neither of the bodies computed for it. Deriving the table from the
 * files is what makes `contentAvailability: 'complete'` exactly their bodies and nothing besides.
 */
function collectBlobs(files: ReadonlyArray<FileEntry>, blobs: BlobStore): Record<Hash, Blob> {
  const named = new Set(files.flatMap((file) => [file.current?.hash, file.planned?.hash]));
  return Object.fromEntries(Object.entries(blobs.toTable()).filter(([hash]) => named.has(hash)));
}

/**
 * Collects the directories a target holds independently of the composition, in lexicographic order.
 *
 * A tree deployment's layout root is such a directory: the composition fills it rather than creating it, and the
 * artifact directories under it are the other way round. A layout rooted at the empty string puts its kind at the
 * target's root, which every target holds anyway and no list has to name.
 */
function collectContainerDirs(target: RenderTarget): Array<string> {
  const roots = target.deployments
    .filter((deployment) => deployment.form === 'tree')
    .map((deployment) => deployment.layout.root)
    .filter((root) => root !== '');

  return [...new Set(roots)].toSorted(compareStrings);
}

/**
 * Collects the partials a plan contains: those the closure's token edges name, and those transclusion drew into a file.
 *
 * The two sets differ. A closure keeps only the partials an edge was read from, while a file's contributors name every
 * partial whose content reached it, and every one of those has to resolve in the table.
 */
function collectPartials(
  named: ReadonlyArray<PartialEntry>,
  files: ReadonlyArray<{ contributors: { partials: ReadonlyArray<PartialId> } }>,
  snapshot: CompositionSnapshot,
): Array<PartialEntry> {
  const known = new Map(named.map((partial) => [partial.id, partial]));
  for (const column of snapshot.renders.values()) {
    for (const render of column.values()) {
      if (render.status === 'rendered') {
        for (const partial of render.partials) {
          known.set(partial.id, partial);
        }
      }
    }
  }

  const referenced = new Set([...named.map(({ id }) => id), ...files.flatMap((file) => file.contributors.partials)]);
  return known
    .values()
    .filter((partial) => referenced.has(partial.id))
    .toArray()
    .toSorted((left, right) => compareStrings(left.id, right.id));
}

/** Orders one of the plan's id-keyed tables lexicographically, which is the contract every such table is read under. */
function sortById<Entry extends { id: Id }>(entries: ReadonlyArray<Entry>): Array<Entry> {
  return entries.toSorted((left, right) => compareStrings(left.id, right.id));
}

/** Reads a render target as the entry a plan contains, its pipeline and deployments being engine input alone. */
function toTargetEntry(target: RenderTarget): TargetEntry {
  return {
    id: target.id,
    label: target.label,
    root: target.root,
    tokenMappings: target.tokenMappings,
    containerDirs: collectContainerDirs(target),
  };
}

// endregion | Helpers
