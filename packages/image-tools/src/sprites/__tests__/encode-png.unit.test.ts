import { describe, expect, it } from 'vitest';

import { encodePng } from '../encode-png.ts';
import type { PaletteEntry, Sprite } from '../parse-sprite-sheet.ts';
import { decodePng } from '../test-utils/decode-png.ts';

const PALETTE: readonly PaletteEntry[] = [
  { key: '.', rgb: undefined },
  { key: 'k', rgb: [0x1d, 0x1b, 0x26] },
  { key: 'b', rgb: [0x18, 0x68, 0xdb] },
];

const HERO_WALK: Sprite = {
  frames: [
    [
      [0, 1, 1, 0],
      [1, 2, 2, 1],
    ],
    [
      [0, 2, 2, 0],
      [1, 1, 1, 1],
    ],
  ],
  height: 2,
  name: 'hero-walk',
  width: 4,
};

describe(encodePng, () => {
  it('lays the frames side by side in an 8-bit indexed strip', () => {
    const png = decodePng(encodePng(HERO_WALK, PALETTE));

    expect(png).toMatchObject({ bitDepth: 8, colourType: 3, height: 2, width: 8 });
    expect(png.rows).toStrictEqual([
      [0, 1, 1, 0, 0, 2, 2, 0],
      [1, 2, 2, 1, 1, 1, 1, 1],
    ]);
  });

  it('writes the palette in order, with black for a transparent entry, and marks transparent entries in tRNS', () => {
    const png = decodePng(encodePng(HERO_WALK, PALETTE));

    expect(png.chunkTypes).toStrictEqual(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);
    expect(png.palette).toStrictEqual([
      [0, 0, 0],
      [0x1d, 0x1b, 0x26],
      [0x18, 0x68, 0xdb],
    ]);
    expect(png.transparency).toStrictEqual([0]);
  });

  it('ends tRNS at the last transparent entry', () => {
    const palette: PaletteEntry[] = [
      { key: 'k', rgb: [0, 0, 0] },
      { key: '.', rgb: undefined },
      { key: ' ', rgb: undefined },
      { key: 'w', rgb: [255, 255, 255] },
    ];

    const png = decodePng(encodePng({ frames: [[[0, 1, 2, 3]]], height: 1, name: 'a', width: 4 }, palette));

    expect(png.transparency).toStrictEqual([255, 0, 0]);
  });

  it('omits tRNS when every entry is opaque', () => {
    const png = decodePng(
      encodePng({ frames: [[[0]]], height: 1, name: 'a', width: 1 }, [{ key: 'k', rgb: [1, 2, 3] }]),
    );

    expect(png.chunkTypes).toStrictEqual(['IHDR', 'PLTE', 'IDAT', 'IEND']);
  });
});
