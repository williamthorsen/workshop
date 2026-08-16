import { describe, expect, it } from 'vitest';

import { stripInlays } from '../stripInlays.ts';

const comment = { open: '<!--', close: '-->' };

describe(stripInlays, () => {
  it('removes a directive and addresses the line it stood on', () => {
    const stripped = strip('# Guidance\n\n<!-- inlay: preferences -->\n\nTail.\n');

    expect(stripped).toStrictEqual({
      status: 'stripped',
      content: '# Guidance\n\n\nTail.\n',
      sites: [{ name: 'preferences', insertAt: 2 }],
    });
  });

  it('addresses each of several inlays against the stripped content, not the input', () => {
    const stripped = strip('<!-- inlay: first -->\nBody.\n<!-- inlay: second -->\n');

    expect(stripped).toHaveProperty('sites', [
      { name: 'first', insertAt: 0 },
      { name: 'second', insertAt: 1 },
    ]);
  });

  it('returns content declaring no inlay byte-identical', () => {
    const content = '# Guidance\n\nNothing to inlay here.\n';

    expect(strip(content)).toStrictEqual({ status: 'stripped', content, sites: [] });
  });

  it('ends the render on a line shaped like a directive that names no single inlay', () => {
    const stripped = strip('Lead.\n<!-- inlay: one two -->\n');

    expect(stripped).toHaveProperty('diagnostic', {
      code: 'unrecognized-parameter',
      message: 'The inlay directive at line 2 names no single inlay: "<!-- inlay: one two -->".',
      line: 2,
    });
  });

  it('ends the render on a body declaring one inlay twice', () => {
    const stripped = strip('<!-- inlay: preferences -->\nBody.\n<!-- inlay: preferences -->\n');

    expect(stripped).toHaveProperty('diagnostic', {
      code: 'duplicate-name',
      message: 'The inlay directive at line 3 declares "preferences", which this body declares already.',
      line: 3,
    });
  });

  it('accepts one body declaring two inlays, which name two places rather than one twice', () => {
    const stripped = strip('<!-- inlay: first -->\n<!-- inlay: second -->\n');

    expect(stripped).toHaveProperty('status', 'stripped');
  });

  it('reads the directives of the syntax it is given, not of Markdown', () => {
    const stripped = stripInlays('# inlay: preferences\nBody.\n', { open: '#', close: '' });

    expect(stripped).toStrictEqual({
      status: 'stripped',
      content: 'Body.\n',
      sites: [{ name: 'preferences', insertAt: 0 }],
    });
  });
});

// region | Helpers

/** Strips `content` under the Markdown comment syntax the cases above share. */
function strip(content: string) {
  return stripInlays(content, comment);
}

// endregion | Helpers
