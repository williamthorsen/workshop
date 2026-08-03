import type { ResolutionAt } from '../../consistency/findResolutionOrderViolations.ts';
import type { Plan } from '../../schemas/plan-schemas.ts';

/** Collects each artifact's resolution, with the path prefix a violation against it is reported under. */
export function collectResolutions(plan: Plan): ReadonlyArray<ResolutionAt> {
  return plan.artifacts.map((artifact, index) => ({
    basePath: `artifacts[${index}].resolution`,
    resolution: artifact.resolution,
  }));
}
