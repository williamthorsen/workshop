import { composeArtifactId } from '../resolution/composeArtifactId.ts';
import type { DependencyEdge } from '../schemas/graph-schemas.ts';
import type { ArtifactId, PartialId } from '../schemas/scalar-schemas.ts';
import type { TokenKind } from '../schemas/token-kind-schemas.ts';
import type { Segment } from '../transclusion/expandTransclusions.ts';
import { compileTokenPattern } from './compileTokenPattern.ts';

/**
 * Collects the closure edges the referent tokens in `segments` contribute.
 *
 * Target-free, because the closure has to be computed before any target is chosen, while rendering the same tokens
 * needs the deployed names that closure produces. Both surfaces read one declaration and match one line at a time, so
 * an anchored pattern cannot recognize a different token set here than the rewrite recognizes.
 *
 * An edge records the partial its token was read from, and only when the token arrived through one. Edges run in
 * segment order, then line by line, then in the order `tokenKinds` declares, and repeat only when they differ in the
 * partial that contributed them: the same partial naming one referent twice is one fact, while two partials naming it
 * are two.
 */
export function extractTokenEdges(
  segments: ReadonlyArray<Segment>,
  tokenKinds: ReadonlyArray<TokenKind>,
): ReadonlyArray<DependencyEdge> {
  const referents = tokenKinds
    .filter((kind) => kind.form === 'referent')
    .map((kind) => ({ artifactKindId: kind.artifactKindId, pattern: compileTokenPattern(kind) }));
  const edges: Array<DependencyEdge> = [];
  const seen = new Set<string>();

  for (const segment of segments) {
    for (const line of segment.lines) {
      for (const referent of referents) {
        for (const [, slug] of line.matchAll(referent.pattern)) {
          if (slug === undefined) {
            continue;
          }
          const edge = createEdge(composeArtifactId(referent.artifactKindId, slug), segment.partialId);
          const key = JSON.stringify([edge.to, edge.partialId]);
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          edges.push(edge);
        }
      }
    }
  }

  return edges;
}

// region | Helpers

/** Builds a token edge, omitting the partial rather than recording it as `undefined`. */
function createEdge(to: ArtifactId, partialId: PartialId | undefined): DependencyEdge {
  return partialId === undefined ? { to, via: 'token' } : { to, via: 'token', partialId };
}

// endregion | Helpers
