import { classifyRegion } from './classifyRegion.ts';
import type { OwnershipOutcome } from './OwnershipOutcome.ts';
import { buildRegionPattern } from './region-matching.ts';
import type { RegionMarkers } from './RegionMarkers.ts';
import { renderContribution } from './renderContribution.ts';

/**
 * Writes `body` into the host's region, replacing the region's content when one is present and appending a region
 * separated by a blank line when none is, and blocks on a host whose marker set is ambiguous.
 *
 * Replacing and appending are one function because the difference between them is a fact about the host rather than a
 * decision a caller makes twice. A consumer that must refuse to *create* a region -- one whose placement belongs to
 * something other than this engine -- calls `classifyRegion` first and acts on `absent` itself.
 *
 * Re-injecting an identical body yields byte-identical content, which is what keeps a re-run diff-free.
 */
export function injectRegion(content: string, markers: RegionMarkers, body: string): OwnershipOutcome {
  const classification = classifyRegion(content, markers);
  if (classification.state === 'malformed') {
    return { blocked: { reason: classification.reason } };
  }

  const region = renderContribution(markers, body);
  if (classification.state === 'complete') {
    // Replace through a function so `$`-sequences in the body are not read as replacement patterns.
    return { content: content.replace(buildRegionPattern(markers), () => region) };
  }
  return { content: content.trim() === '' ? `${region}\n` : `${content.replace(/\n*$/, '\n')}\n${region}\n` };
}
