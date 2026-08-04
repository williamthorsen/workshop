import { describe, expect, it } from 'vitest';

import type { RegionMarkers } from '../RegionMarkers.ts';
import { removeRegion } from '../removeRegion.ts';

const MARKERS: RegionMarkers = { open: '<!-- ambient:start -->', close: '<!-- ambient:end -->' };

describe(removeRegion, () => {
  it('strips a trailing region along with the blank line that separated it', () => {
    const content = `# Guidance\n\n${MARKERS.open}\nbody\n${MARKERS.close}\n`;

    expect(removeRegion(content, MARKERS)).toStrictEqual({ content: '# Guidance\n' });
  });

  it('strips a region between two blocks of user text, leaving one blank line behind', () => {
    const content = `a\n\n${MARKERS.open}\nbody\n${MARKERS.close}\n\nb\n`;

    expect(removeRegion(content, MARKERS)).toStrictEqual({ content: 'a\n\nb\n' });
  });

  it('if the region opened the host, leaves nothing before what followed it', () => {
    const content = `${MARKERS.open}\nbody\n${MARKERS.close}\nb\n`;

    expect(removeRegion(content, MARKERS)).toStrictEqual({ content: 'b\n' });
  });

  it('if the region was the whole host, yields an empty string', () => {
    expect(removeRegion(`${MARKERS.open}\nbody\n${MARKERS.close}\n`, MARKERS)).toStrictEqual({ content: '' });
  });

  it('if the host holds no region, returns it unchanged rather than blocking', () => {
    expect(removeRegion('# Guidance\n', MARKERS)).toStrictEqual({ content: '# Guidance\n' });
  });

  it('if the host is damaged, blocks rather than stripping a span the region does not own', () => {
    const content = `${MARKERS.open}\n\nUser text.\n\n${MARKERS.open}\nbody\n${MARKERS.close}\n`;

    expect(removeRegion(content, MARKERS)).toHaveProperty('blocked.reason', expect.stringContaining('2 open markers'));
  });
});
