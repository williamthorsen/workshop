/** Contribution markers: what one artifact's block in a shared host is delimited by, written and read. */

import type { ContributionPatterns } from '../ownership/readContributions.ts';
import type { RegionMarkers } from '../ownership/RegionMarkers.ts';
import { escapeForRegExp } from '../portable/escapeForRegExp.ts';
import type { MarkerPair } from '../schemas/render-target-schemas.ts';
import type { ArtifactId } from '../schemas/scalar-schemas.ts';

/** The placeholder a contribution marker template stands its contributor's id in. */
export const ARTIFACT_ID_PLACEHOLDER = '{artifactId}';

/**
 * Renders the markers `artifactId`'s contribution is written behind.
 *
 * The substitution goes through a function rather than a string, so an id carrying `$&` or `$'` is inserted verbatim
 * instead of being read as a replacement pattern -- the same care `resolveDeployedNames` takes over a slug.
 */
export function renderContributionMarkers(template: MarkerPair, artifactId: ArtifactId): RegionMarkers {
  return {
    open: template.open.replaceAll(ARTIFACT_ID_PLACEHOLDER, () => artifactId),
    close: template.close.replaceAll(ARTIFACT_ID_PLACEHOLDER, () => artifactId),
  };
}

/**
 * Builds the patterns a host's contributions are read back through, capturing each block's contributor.
 *
 * Derived from the same template the markers are written from, so a host is read through exactly what was written into
 * it. A separately declared read pattern would be a second statement of one fact, and the two would drift.
 *
 * Each pattern is anchored to its line and tolerates surrounding horizontal whitespace, matching the rules a region's
 * own markers are found by: a host that indents a contribution, as a YAML one does, must not thereby lose it.
 *
 * The capture is lazy and line-bounded rather than narrowed to an id-shaped character class, which keeps the derivation
 * free of any assumption about what a consumer's ids look like. Under the conventional pairing, where a close marker is
 * an open marker with one more character in it, the open pattern also matches a close marker line and captures a key no
 * artifact carries. That is harmless: `readContributions` pairs an open with a close capturing the same key, and drops
 * an open that finds none.
 *
 * One capture group per pattern is what `readContributions` requires, so a template stands its placeholder exactly
 * once. That a declaration does is `assertRenderTargetsAreConsistent`'s question.
 */
export function buildContributionPatterns(template: MarkerPair): ContributionPatterns {
  return { open: toMarkerLinePattern(template.open), close: toMarkerLinePattern(template.close) };
}

// region | Helpers

/** Renders the pattern source matching a line holding one rendered marker and nothing else. */
function toMarkerLinePattern(template: string): string {
  const literals = template.trim().split(ARTIFACT_ID_PLACEHOLDER).map(escapeForRegExp);
  return String.raw`^[ \t]*${literals.join('(.+?)')}[ \t]*$`;
}

// endregion | Helpers
