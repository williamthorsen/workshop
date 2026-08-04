import { describe, expect, it } from 'vitest';

import {
  CLAUDE_MD_CURRENT,
  CLAUDE_MD_PLANNED,
  REGION_CLOSE,
  REGION_OPEN,
} from '../../samples/representative/file-bodies.ts';
import { injectRegion } from '../injectRegion.ts';
import type { ContributionPatterns } from '../readContributions.ts';
import { readContributions } from '../readContributions.ts';
import type { RegionMarkers } from '../RegionMarkers.ts';
import { renderContribution } from '../renderContribution.ts';

const MARKERS: RegionMarkers = { open: REGION_OPEN, close: REGION_CLOSE };

const PATTERNS: ContributionPatterns = {
  open: '^<!-- rulebook:([a-z-]+) -->$',
  close: '^<!-- /rulebook:([a-z-]+) -->$',
};

const RULEBOOKS = [
  { slug: 'naming', body: 'Name functions with a leading verb.' },
  { slug: 'style', body: 'Use sentence case.' },
  { slug: 'tests', body: 'Name tests for the behavior they pin.' },
];

// The sample bodies are the repo's committed statement of the shapes a plan carries, so driving one to the other
// exercises these mechanisms against a fixture nothing else in the change authored.
describe('region ownership over the representative sample', () => {
  it('drives the current guidance file to the planned one, byte for byte', () => {
    expect(injectRegion(CLAUDE_MD_CURRENT, MARKERS, renderRulebooks())).toStrictEqual({ content: CLAUDE_MD_PLANNED });
  });

  it('reads every contribution back out of the planned guidance file', () => {
    expect(readContributions(CLAUDE_MD_PLANNED, PATTERNS)).toStrictEqual(
      RULEBOOKS.map((rulebook) => ({ key: rulebook.slug, body: rulebook.body })),
    );
  });

  it('reads the one contribution the current guidance file carries', () => {
    expect(readContributions(CLAUDE_MD_CURRENT, PATTERNS)).toStrictEqual([
      { key: 'style', body: 'Use sentence case.' },
    ]);
  });
});

// region | Helpers

/** Renders the aggregated region body the planned guidance file carries: one block per rulebook, blank-line separated. */
function renderRulebooks(): string {
  return RULEBOOKS.map((rulebook) =>
    renderContribution(
      { open: `<!-- rulebook:${rulebook.slug} -->`, close: `<!-- /rulebook:${rulebook.slug} -->` },
      rulebook.body,
    ),
  ).join('\n\n');
}

// endregion | Helpers
