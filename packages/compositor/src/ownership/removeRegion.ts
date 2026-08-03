import { classifyRegion } from './classifyRegion.ts';
import type { OwnershipOutcome } from './OwnershipOutcome.ts';
import { buildRegionPattern } from './region-matching.ts';
import type { RegionMarkers } from './RegionMarkers.ts';

/**
 * Strips the host's region along with the blank line that separated it from what preceded it, and blocks on a host
 * whose marker set is ambiguous.
 *
 * A host holding no region is returned unchanged rather than blocked: nothing is owed to a destination the engine
 * never wrote to.
 */
export function removeRegion(content: string, markers: RegionMarkers): OwnershipOutcome {
  const classification = classifyRegion(content, markers);
  if (classification.state === 'malformed') {
    return { blocked: { reason: classification.reason } };
  }
  if (classification.state === 'absent') {
    return { content };
  }

  const match = buildRegionPattern(markers).exec(content);
  if (match === null) {
    return { content };
  }

  const before = content.slice(0, match.index).replace(/\n\n$/, '\n');
  // The region's own line ended in a newline the surrounding text does not need once the region is gone.
  const after = content.slice(match.index + match[0].length).replace(/^\n/, '');
  return { content: before + after };
}
