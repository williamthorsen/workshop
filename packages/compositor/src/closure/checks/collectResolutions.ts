import type { ResolutionAt } from '../../consistency/findResolutionOrderViolations.ts';
import type { Closure } from '../../schemas/closure-schemas.ts';

/** Collects each artifact's resolution, with the path prefix a violation against it is reported under. */
export function collectResolutions(closure: Closure): ReadonlyArray<ResolutionAt> {
  return closure.artifacts.map((artifact, index) => ({
    basePath: `artifacts[${index}].resolution`,
    resolution: artifact.resolution,
  }));
}
