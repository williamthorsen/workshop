import type { CatalogEntry } from '../schemas/catalog-schemas.ts';
import type { ClosureArtifact, ClosureDiagnostic } from '../schemas/closure-schemas.ts';
import type { DependencyEdge, Seed } from '../schemas/graph-schemas.ts';
import type { ArtifactId } from '../schemas/scalar-schemas.ts';

/** What the walk reads: the artifacts that exist, the edges between them, and where to start. */
export interface WalkInput {
  readonly entries: ReadonlyMap<ArtifactId, CatalogEntry>;
  readonly edges: ReadonlyMap<ArtifactId, ReadonlyArray<DependencyEdge>>;
  /** The artifacts something seeded, in the order the walk starts from them. */
  readonly seeds: ReadonlyArray<{ artifactId: ArtifactId; seededBy: ReadonlyArray<Seed> }>;
}

/** Everything the walk reached, and the faults met on the way. */
export interface WalkResult {
  readonly artifacts: ReadonlyArray<ClosureArtifact>;
  readonly diagnostics: ReadonlyArray<ClosureDiagnostic>;
}

/**
 * Follows every edge reachable from the seeds, collecting the artifacts it reaches.
 *
 * Aggregates are walked through and kept, unlike the code this ports from, which dropped them once expanded. A kind
 * that emits no files is what keeps one out of the output, and keeping it in the graph is what lets a reader see the
 * route by which a member arrived rather than an unexplained membership.
 *
 * Neither fault it can meet stops it. A cycle records a diagnostic and the walk turns back, so everything reachable is
 * still reached and no caller waits on a walk that will not end; one cycle reports once however many seeds reach it. An
 * edge naming an artifact no source carries records a diagnostic and is dropped, which is what keeps every edge in the
 * result pointing at something the result carries.
 *
 * Artifacts come back in the order they were first reached, which follows the seeds and then each artifact's own edge
 * order.
 */
export function walkEdges(input: WalkInput): WalkResult {
  const { entries, edges, seeds } = input;
  const seededBy = new Map(seeds.map(({ artifactId, seededBy: records }) => [artifactId, records]));
  const reached = new Map<ArtifactId, ClosureArtifact>();
  const diagnostics: Array<ClosureDiagnostic> = [];
  const reportedCycles = new Set<string>();
  const trail: Array<ArtifactId> = [];
  const onTrail = new Set<ArtifactId>();

  function visit(entry: CatalogEntry): void {
    if (onTrail.has(entry.id)) {
      return;
    }
    if (reached.has(entry.id)) {
      return;
    }

    const outgoing: Array<DependencyEdge> = [];
    const declared = edges.get(entry.id) ?? [];
    for (const edge of declared) {
      if (entries.has(edge.to)) {
        outgoing.push(edge);
        continue;
      }
      diagnostics.push({
        code: 'unknown-reference',
        message: `${entry.id} names "${edge.to}" as ${describeOrigin(edge)}, which no source carries.`,
        at: { artifactId: entry.id },
      });
    }

    reached.set(entry.id, {
      id: entry.id,
      kindId: entry.kindId,
      slug: entry.slug,
      seededBy: [...(seededBy.get(entry.id) ?? [])],
      dependsOn: outgoing,
      resolution: entry.resolution,
    });

    trail.push(entry.id);
    onTrail.add(entry.id);
    for (const edge of outgoing) {
      reportCycle(edge.to, diagnostics, reportedCycles, trail, onTrail);
      const next = entries.get(edge.to);
      if (next !== undefined) {
        visit(next);
      }
    }
    trail.pop();
    onTrail.delete(entry.id);
  }

  for (const seed of seeds) {
    const entry = entries.get(seed.artifactId);
    if (entry === undefined) {
      throw new Error(`Seeded artifact "${seed.artifactId}" is not one the catalog carries.`);
    }
    visit(entry);
  }

  return { artifacts: reached.values().toArray(), diagnostics };
}

// region | Helpers

/** Names the origin an edge carries, for a message a reader reads rather than decodes. */
function describeOrigin(edge: DependencyEdge): string {
  switch (edge.via) {
    case 'declared':
      return 'a dependency';
    case 'enumerated':
      return 'a member of the source it takes in whole';
    case 'injected':
      return 'an injected artifact';
    case 'member':
      return 'a member';
    case 'token':
      return edge.partialId === undefined ? 'a token in its body' : `a token in "${edge.partialId}"`;
  }
}

/** Records the cycle an edge back onto the trail closes, once per closing edge however many seeds reach it. */
function reportCycle(
  to: ArtifactId,
  diagnostics: Array<ClosureDiagnostic>,
  reported: Set<string>,
  trail: ReadonlyArray<ArtifactId>,
  onTrail: ReadonlySet<ArtifactId>,
): void {
  const from = trail.at(-1);
  if (from === undefined || !onTrail.has(to)) {
    return;
  }

  const closing = JSON.stringify([from, to]);
  if (reported.has(closing)) {
    return;
  }
  reported.add(closing);

  const cycle = trail.slice(trail.indexOf(to));
  diagnostics.push({
    code: 'dependency-cycle',
    message: `${[...cycle, to].join(' -> ')} is a dependency cycle.`,
    at: { artifactId: from },
    cycle,
  });
}

// endregion | Helpers
