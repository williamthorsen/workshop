import type { Violation } from '../../consistency/Violation.ts';
import type { Plan } from '../../schemas/plan-schemas.ts';

/** Reports each edge naming a partial it could not have been read from. */
export function findMisplacedPartialReferences(plan: Plan): Array<Violation> {
  const violations: Array<Violation> = [];
  for (const [index, artifact] of plan.artifacts.entries()) {
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
