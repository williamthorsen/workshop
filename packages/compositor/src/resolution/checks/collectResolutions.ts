import type { ResolutionAt } from '../../consistency/findResolutionOrderViolations.ts';
import type { Catalog } from '../../schemas/resolution-schemas.ts';

/** Each entry's resolution, with the path prefix a violation against it is reported under. */
export function collectResolutions(catalog: Catalog): ReadonlyArray<ResolutionAt> {
  return catalog.entries.map((entry, index) => ({
    basePath: `entries[${index}].resolution`,
    resolution: entry.resolution,
  }));
}
