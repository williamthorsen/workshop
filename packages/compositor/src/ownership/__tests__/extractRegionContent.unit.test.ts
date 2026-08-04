import { describe, expect, it } from 'vitest';

import { extractRegionContent } from '../extractRegionContent.ts';
import type { RegionMarkers } from '../RegionMarkers.ts';

const MARKERS: RegionMarkers = { open: '<!-- ambient:start -->', close: '<!-- ambient:end -->' };

describe(extractRegionContent, () => {
  it('returns the region body without its surrounding newlines', () => {
    const content = `# Guidance\n\n${MARKERS.open}\nUse sentence case.\n${MARKERS.close}\n`;

    expect(extractRegionContent(content, MARKERS)).toBe('Use sentence case.');
  });

  it('if the region is empty, returns an empty string rather than undefined', () => {
    expect(extractRegionContent(`${MARKERS.open}\n${MARKERS.close}\n`, MARKERS)).toBe('');
  });

  it('if the host holds no region, returns undefined', () => {
    expect(extractRegionContent('# Guidance\n', MARKERS)).toBeUndefined();
  });

  it('if a stray marker widens what the pattern would match, returns undefined rather than text the region does not own', () => {
    const content = `${MARKERS.open}\n\nUser text.\n\n${MARKERS.open}\nowned\n${MARKERS.close}\n`;

    expect(extractRegionContent(content, MARKERS)).toBeUndefined();
  });

  it('preserves the indentation of a body a YAML host indented', () => {
    const markers: RegionMarkers = { open: '  # managed:start', close: '  # managed:end' };
    const content = `prompts:\n${markers.open}\n  - name: lint\n${markers.close}\n`;

    expect(extractRegionContent(content, markers)).toBe('  - name: lint');
  });
});
