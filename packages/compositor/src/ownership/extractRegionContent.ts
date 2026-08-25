import { classifyRegion } from './classifyRegion.ts';
import { buildRegionPattern } from './region-matching.ts';
import type { RegionMarkers } from './RegionMarkers.ts';

/**
 * Returns the region's body with no surrounding newlines, or `undefined` unless exactly one well-formed region is
 * present.
 *
 * A damaged host yields `undefined` rather than the widened span the region pattern matches there, so a caller
 * moving region content across a re-render cannot move text the region does not own back into it.
 */
export function extractRegionContent(content: string, markers: RegionMarkers): string | undefined {
  if (classifyRegion(content, markers).state !== 'complete') {
    return undefined;
  }
  const match = buildRegionPattern(markers).exec(content);
  return match === null ? undefined : (match[1] ?? '').replace(/\n+$/, '');
}
