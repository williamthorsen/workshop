import { describe, expect, it } from 'vitest';

import { parseSpriteSheet } from '../parse-sprite-sheet.ts';

const PALETTE = { '.': null, k: '#1d1b26', b: '#1868DB' };

describe(parseSpriteSheet, () => {
  it('returns the palette in key order and each frame as rows of palette indices', () => {
    const result = parseSpriteSheet(
      JSON.stringify({
        palette: PALETTE,
        sprites: {
          'hero-walk': {
            frames: [
              ['.kk.', 'kbbk'],
              ['.bb.', 'kkkk'],
            ],
          },
        },
      }),
    );

    expect(result).toStrictEqual({
      ok: true,
      sheet: {
        palette: [
          { key: '.', rgb: undefined },
          { key: 'k', rgb: [0x1d, 0x1b, 0x26] },
          { key: 'b', rgb: [0x18, 0x68, 0xdb] },
        ],
        sprites: [
          {
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
          },
        ],
      },
    });
  });

  it('accepts space as a palette key and several transparent keys', () => {
    const result = parseSpriteSheet(
      JSON.stringify({ palette: { ' ': null, '.': null, k: '#000000' }, sprites: { a: { frames: [[' .k']] } } }),
    );

    expect(result.ok).toBe(true);
  });

  it.each([
    ['text that is not JSON', '{', [expect.stringMatching(/^not valid JSON: /)]],
    ['a top level that is not an object', '[]', ['the sprite data must be an object of palette and sprites']],
  ])('reports %s', (_label, text, problems) => {
    expect(parseSpriteSheet(text)).toStrictEqual({ ok: false, problems });
  });

  it.each([
    [
      'an unknown top-level key',
      { palette: PALETTE, sprites: { a: { frames: [['k']] } }, sprite: {} },
      ['unknown key "sprite"; the sprite data takes palette and sprites'],
    ],
    [
      'a missing palette',
      { sprites: { a: { frames: [['k']] } } },
      [
        'palette: missing; it must map each character to a colour',
        'sprite "a", frame 1, row 1, column 1: "k" is not in the palette',
      ],
    ],
    [
      'a palette that is not an object',
      { palette: ['#000000'], sprites: {} },
      ['palette: must be an object that maps each character to a colour', 'sprites: must declare at least one sprite'],
    ],
    [
      'an empty palette',
      { palette: {}, sprites: { a: { frames: [['k']] } } },
      ['palette: must declare at least one entry', 'sprite "a", frame 1, row 1, column 1: "k" is not in the palette'],
    ],
    [
      'a palette key longer than one character',
      { palette: { kk: '#000000' }, sprites: { a: { frames: [['k']] } } },
      [
        'palette key "kk": must be one printable ASCII character',
        'sprite "a", frame 1, row 1, column 1: "k" is not in the palette',
      ],
    ],
    [
      'a palette key outside printable ASCII',
      { palette: { é: '#000000', k: '#000000' }, sprites: { a: { frames: [['k']] } } },
      ['palette key "é": must be one printable ASCII character'],
    ],
    [
      'a colour that is not #rrggbb',
      { palette: { k: '#fff' }, sprites: { a: { frames: [['k']] } } },
      ['palette key "k": "#fff" is not a colour; use #rrggbb, or null for transparent'],
    ],
    [
      'a palette over 16 entries',
      {
        palette: Object.fromEntries([...'abcdefghijklmnopq'].map((key) => [key, '#000000'])),
        sprites: { a: { frames: [['a']] } },
      },
      ['palette: declares 17 entries; at most 16 are allowed'],
    ],
    ['missing sprites', { palette: PALETTE }, ['sprites: missing; it must map each sprite name to its frames']],
    [
      'sprites that are not an object',
      { palette: PALETTE, sprites: [] },
      ['sprites: must be an object that maps each sprite name to its frames'],
    ],
    ['an empty sprites object', { palette: PALETTE, sprites: {} }, ['sprites: must declare at least one sprite']],
    [
      'a sprite name outside [a-z0-9-]+',
      { palette: PALETTE, sprites: { Hero_1: { frames: [['k']] } } },
      ['sprite "Hero_1": the name must match [a-z0-9-]+'],
    ],
    [
      'a sprite that is not an object',
      { palette: PALETTE, sprites: { a: [['k']] } },
      ['sprite "a": must be an object with frames'],
    ],
    [
      'an unknown sprite key',
      { palette: PALETTE, sprites: { a: { frame: [['k']] } } },
      [
        'sprite "a": unknown key "frame"; a sprite takes frames',
        'sprite "a": frames must be a non-empty list of frames',
      ],
    ],
    [
      'empty frames',
      { palette: PALETTE, sprites: { a: { frames: [] } } },
      ['sprite "a": frames must be a non-empty list of frames'],
    ],
    [
      'an empty frame',
      { palette: PALETTE, sprites: { a: { frames: [['k'], []] } } },
      ['sprite "a", frame 2: must be a non-empty list of rows'],
    ],
    [
      'a row that is not a string',
      { palette: PALETTE, sprites: { a: { frames: [['k', 1]] } } },
      ['sprite "a", frame 1, row 2: must be a string of palette characters'],
    ],
    [
      'an empty row',
      { palette: PALETTE, sprites: { a: { frames: [['k', '']] } } },
      ['sprite "a", frame 1, row 2: is empty'],
    ],
    [
      'a ragged row',
      { palette: PALETTE, sprites: { a: { frames: [['kk'], ['k']] } } },
      ['sprite "a", frame 2, row 1: has 1 pixels; row 1 of frame 1 has 2'],
    ],
    [
      'a frame with a different number of rows',
      {
        palette: PALETTE,
        sprites: {
          a: {
            frames: [
              ['k', 'k'],
              ['k', 'k', 'k'],
            ],
          },
        },
      },
      ['sprite "a", frame 2: has 3 rows; frame 1 has 2'],
    ],
    [
      'a character missing from the palette',
      { palette: PALETTE, sprites: { a: { frames: [['kk'], ['kx']] } } },
      ['sprite "a", frame 2, row 1, column 2: "x" is not in the palette'],
    ],
  ])('reports %s', (_label, data, problems) => {
    expect(parseSpriteSheet(JSON.stringify(data))).toStrictEqual({ ok: false, problems });
  });

  it('reports every problem in the file, not only the first', () => {
    const result = parseSpriteSheet(
      JSON.stringify({ palette: { k: 'black' }, sprites: { Bad: { frames: [['k']] }, b: { frames: [['kz']] } } }),
    );

    expect(result).toStrictEqual({
      ok: false,
      problems: [
        'palette key "k": "black" is not a colour; use #rrggbb, or null for transparent',
        'sprite "Bad": the name must match [a-z0-9-]+',
        'sprite "b", frame 1, row 1, column 2: "z" is not in the palette',
      ],
    });
  });
});
