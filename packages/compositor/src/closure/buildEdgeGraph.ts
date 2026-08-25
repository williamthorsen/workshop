import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { compareStrings } from '../portable/compareStrings.ts';
import type { Catalog, CatalogEntry, SourceSpec } from '../schemas/catalog-schemas.ts';
import type { ClosureDiagnostic } from '../schemas/closure-schemas.ts';
import type { EdgeRule, KindKeys } from '../schemas/edge-rule-schemas.ts';
import type { DependencyEdge, PartialEntry } from '../schemas/graph-schemas.ts';
import type { ArtifactId, KindId } from '../schemas/scalar-schemas.ts';
import { buildCatalogIndex, type CatalogIndex } from '../selection/buildCatalogIndex.ts';
import { assertEdgeRulesAreConsistent } from './assertEdgeRulesAreConsistent.ts';
import type { EdgeContribution, EdgeContributor } from './EdgeContributor.ts';
import type { EdgeGraph } from './EdgeGraph.ts';
import { expandWildcard } from './expandWildcard.ts';
import { type KindEdgeRules, readFrontmatterEdges } from './readFrontmatterEdges.ts';

/** What building the edge graph reads. */
export interface EdgeGraphInput {
  readonly catalog: Catalog;
  readonly rules: ReadonlyArray<EdgeRule>;
  readonly kindKeys: KindKeys;
  /** Supplies the edges a body declares, which no key can state. Absent leaves the graph to frontmatter alone. */
  readonly contributeEdges?: EdgeContributor | undefined;
}

/**
 * Reads every edge the catalog's artifacts declare, so that computing a closure from them reads nothing.
 *
 * This is the whole of the closure's filesystem contact. Every entry is read, not only the ones a config happens to
 * select, because a reader toggling a selection expects the artifacts it pulls in to already be known; reading lazily
 * would put a disk read behind every toggle, which is what the What-if flow exists to avoid.
 *
 * Wildcards expand here rather than during the walk, depending as they do on the catalog alone: a config change cannot
 * move what a source contains, so an expansion computed once stays correct for every closure taken from this graph.
 *
 * A fault in the rules throws, having no artifact to belong to, while a fault in an artifact's content is a diagnostic.
 * An entry file that cannot be read throws as well: a permissions fault is not an authoring mistake, and treating it as
 * an absence would quietly drop every edge that artifact declared.
 */
export async function buildEdgeGraph(input: EdgeGraphInput): Promise<EdgeGraph> {
  const { catalog, rules, kindKeys, contributeEdges } = input;
  assertEdgeRulesAreConsistent(rules, kindKeys, catalog.kinds);

  const index = buildCatalogIndex(catalog);
  const emittingKindIds = catalog.kinds.filter((kind) => kind.emitsFiles).map(({ id }) => id);
  const rulesByKind = groupRulesByKind(
    rules,
    catalog.kinds.map(({ id }) => id),
  );
  const sources = new Map(catalog.sources.map((source) => [source.id, source]));

  // Entries are read concurrently; the assembly below runs in catalog order, so the order they finish in cannot reach
  // the graph.
  const reads = await Promise.all(
    catalog.entries.map((entry) =>
      readEntry(entry, {
        contributeEdges,
        emittingKindIds,
        index,
        kindKeys,
        kindRules: rulesByKind.get(entry.kindId) ?? EMPTY_RULES,
        source: requireSource(sources, entry),
      }),
    ),
  );

  const edges = new Map<ArtifactId, ReadonlyArray<DependencyEdge>>();
  const partials = new Map<string, PartialEntry>();
  const diagnostics: Array<ClosureDiagnostic> = [];
  for (const read of reads) {
    if (read.edges.length > 0) {
      edges.set(read.artifactId, read.edges);
    }
    for (const partial of read.partials) {
      partials.set(partial.id, partial);
    }
    diagnostics.push(...read.diagnostics);
  }

  return {
    catalog,
    edges,
    partials: partials
      .values()
      .toArray()
      .toSorted((left, right) => compareStrings(left.id, right.id)),
    diagnostics,
  };
}

// region | Helpers

/** The rules of a kind no rule names, shared rather than rebuilt per artifact of every such kind. */
const EMPTY_RULES: KindEdgeRules = { rules: [], foreignKeys: new Set() };

/** What reading one entry needs beyond the entry itself. */
interface EntryContext {
  readonly contributeEdges: EdgeContributor | undefined;
  readonly emittingKindIds: ReadonlyArray<KindId>;
  readonly index: CatalogIndex;
  readonly kindKeys: KindKeys;
  readonly kindRules: KindEdgeRules;
  readonly source: SourceSpec;
}

/** Everything one entry contributed to the graph. */
interface EntryRead {
  readonly artifactId: ArtifactId;
  readonly edges: ReadonlyArray<DependencyEdge>;
  readonly partials: ReadonlyArray<PartialEntry>;
  readonly diagnostics: ReadonlyArray<ClosureDiagnostic>;
}

/**
 * Groups the rules by the kind they read, and collects the keys each kind's artifacts must not declare.
 *
 * A key some other kind's rule owns is a misplaced declaration: an author who wrote it meant to declare edges, and
 * nothing would otherwise read it. A key no rule anywhere owns is ordinary metadata and passes unremarked.
 */
function groupRulesByKind(
  rules: ReadonlyArray<EdgeRule>,
  kindIds: ReadonlyArray<KindId>,
): ReadonlyMap<KindId, KindEdgeRules> {
  const byKind = new Map<KindId, Array<EdgeRule>>();
  for (const rule of rules) {
    byKind.set(rule.kindId, [...(byKind.get(rule.kindId) ?? []), rule]);
  }

  const grouped = new Map<KindId, KindEdgeRules>();
  for (const kindId of kindIds) {
    const own = byKind.get(kindId) ?? [];
    const ownKeys = new Set(own.map(({ key }) => key));
    const foreignKeys = new Set(rules.map(({ key }) => key).filter((key) => !ownKeys.has(key)));
    grouped.set(kindId, { rules: own, foreignKeys });
  }
  return grouped;
}

/** Reads one entry's declared and contributed edges, and the partials the contribution came from. */
async function readEntry(entry: CatalogEntry, context: EntryContext): Promise<EntryRead> {
  const { path: relativePath } = entry.resolution.winner;
  const content = await readFile(path.join(context.source.dir, relativePath), 'utf8');

  const declared = readFrontmatterEdges({
    artifactId: entry.id,
    content,
    kindKeys: context.kindKeys,
    kindRules: context.kindRules,
    expand: () => expandWildcard(entry, context.index, context.emittingKindIds),
  });

  const contributed = await contribute(entry, relativePath, content, context);
  return {
    artifactId: entry.id,
    edges: [...declared.edges, ...contributed.edges],
    partials: contributed.partials,
    diagnostics: declared.diagnostics,
  };
}

/**
 * Runs the contributor over one entry, if there is one.
 *
 * A contributed token edge naming its own artifact is dropped: a body naming itself renders per target, but it is not a
 * dependency, and letting it through would report every self-naming artifact as a cycle. A self-dependency written in
 * frontmatter is left alone, an author who declared one having said something a cycle diagnostic should report.
 */
async function contribute(
  entry: CatalogEntry,
  relativePath: string,
  content: string,
  context: EntryContext,
): Promise<EdgeContribution> {
  if (context.contributeEdges === undefined) {
    return { edges: [], partials: [] };
  }

  const contribution = await context.contributeEdges({
    artifactId: entry.id,
    kindId: entry.kindId,
    slug: entry.slug,
    source: { id: context.source.id, dir: context.source.dir },
    path: relativePath,
    content,
  });
  return {
    edges: contribution.edges.filter((edge) => !(edge.via === 'token' && edge.to === entry.id)),
    partials: contribution.partials,
  };
}

/** Reads the source an entry resolved from, which a catalog the engine produced always contains. */
function requireSource(sources: ReadonlyMap<string, SourceSpec>, entry: CatalogEntry): SourceSpec {
  const source = sources.get(entry.resolution.winner.sourceId);
  if (source === undefined) {
    throw new Error(
      `Catalog entry "${entry.id}" resolved from "${entry.resolution.winner.sourceId}", which it does not contain.`,
    );
  }
  return source;
}

// endregion | Helpers
