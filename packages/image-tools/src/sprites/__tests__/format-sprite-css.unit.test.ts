import { describe, expect, it } from 'vitest';

import { formatSpriteCss } from '../format-sprite-css.ts';

const PNG = Buffer.from('png bytes');

const PNG_BASE64 = PNG.toString('base64');

describe(formatSpriteCss, () => {
  it('sizes the element to one frame, the background to the strip, and offsets --last-x to the last frame', () => {
    const frame = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];

    const css = formatSpriteCss({ frames: [frame, frame], height: 2, name: 'hero-walk', width: 4 }, PNG);

    expect(css).toBe(
      [
        '.sprite-hero-walk {',
        '  width: 4px;',
        '  height: 2px;',
        `  background: url(data:image/png;base64,${PNG_BASE64}) 0 0 / 8px 2px no-repeat;`,
        '  --frames: 2;',
        '  --last-x: -4px;',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('gives a one-frame sprite --last-x of 0px', () => {
    const css = formatSpriteCss({ frames: [[[0, 0, 0]]], height: 1, name: 'still', width: 3 }, PNG);

    expect(css).toContain('0 0 / 3px 1px no-repeat;');
    expect(css).toContain('  --frames: 1;\n  --last-x: 0px;\n');
  });
});
