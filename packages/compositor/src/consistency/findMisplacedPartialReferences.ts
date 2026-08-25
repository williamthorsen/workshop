import type { DependencyGraphView } from '../graph/traversal.ts';
import type { Violation } from './Violation.ts';

/**
 * Reports each edge naming a partial it could not have been read from.
 *
 * Takes any document containing artifacts and edges, so one copy checks a plan and a closure alike: a token is the only
 * origin read from a partial, wherever the edge is recorded.
 */
export function findMisplacedPartialReferences(view: DependencyGraphView): Array<Violation> {
  const violations: Array<Violation> = [];
  for (const [index, artifact] of view.artifacts.entries()) {
    const edges = artifact.dependsOn ?? [];
    for (const [edgeIndex, edge] of edges.entries()) {
      if (edge.partialId !== undefined && edge.via !== 'token') {
        violations.push({
          path: `artifacts[${index}].dependsOn[${edgeIndex}].partialId`,
          message: `is set on a "${edge.via}" edge, and only a token edge is read from a partial`,
        });
      }
    }
  }
  return violations;
}
