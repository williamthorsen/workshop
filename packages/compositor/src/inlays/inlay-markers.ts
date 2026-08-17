/** Inlay markers: what a filled inlay is delimited by in the body that declared it. */

import type { RegionMarkers } from '../ownership/RegionMarkers.ts';
import type { MarkerPair } from '../schemas/render-target-schemas.ts';

/** The placeholder an inlay's marker template stands its name in. */
export const INLAY_NAME_PLACEHOLDER = '{inlayName}';

/**
 * Renders the markers a filled inlay is fenced by.
 *
 * The substitution goes through a function rather than a string, so a name carrying `$&` or `$'` is inserted verbatim
 * instead of being read as a replacement pattern -- the same care `renderContributionMarkers` takes over an id.
 */
export function renderInlayMarkers(template: MarkerPair, inlayName: string): RegionMarkers {
  return {
    open: template.open.replaceAll(INLAY_NAME_PLACEHOLDER, () => inlayName),
    close: template.close.replaceAll(INLAY_NAME_PLACEHOLDER, () => inlayName),
  };
}
