import { describeError } from '@williamthorsen/toolbelt.errors';
import { isRecord } from '@williamthorsen/toolbelt.objects';

/** The largest number of entries, the transparent one included, that a palette may declare. */
export const MAX_PALETTE_ENTRIES = 16;

/** One palette entry: the character that stands for it, and its colour, or `undefined` for a transparent pixel. */
export interface PaletteEntry {
  readonly key: string;
  readonly rgb: readonly [number, number, number] | undefined;
}

/** A named sprite whose frames are rows of palette indices, all of the same size. */
export interface Sprite {
  /** The frames in play order; each is a list of rows, top to bottom, of indices into the palette. */
  readonly frames: readonly (readonly (readonly number[])[])[];
  readonly height: number;
  readonly name: string;
  readonly width: number;
}

/** A validated sprite data file. */
export interface SpriteSheet {
  readonly palette: readonly PaletteEntry[];
  readonly sprites: readonly Sprite[];
}

/** The outcome of parsing sprite data: the sheet, or every problem found in it. */
export type SpriteSheetResult = { ok: true; sheet: SpriteSheet } | { ok: false; problems: readonly string[] };

/** Parses and validates the text of a sprite data file, collecting every problem rather than stopping at the first. */
export function parseSpriteSheet(text: string): SpriteSheetResult {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch (error) {
    return { ok: false, problems: [`not valid JSON: ${describeError(error)}`] };
  }
  if (!isRecord(document)) {
    return { ok: false, problems: ['the sprite data must be an object of palette and sprites'] };
  }

  const problems: string[] = [];
  for (const key of Object.keys(document)) {
    if (!TOP_LEVEL_KEYS.has(key)) {
      problems.push(`unknown key ${JSON.stringify(key)}; the sprite data takes palette and sprites`);
    }
  }
  const { palette: paletteValue, sprites: spritesValue } = document;
  const palette = readPalette(paletteValue, problems);
  const sprites = readSprites(spritesValue, palette, problems);
  return problems.length === 0 ? { ok: true, sheet: { palette: palette.entries, sprites } } : { ok: false, problems };
}

// region | Helpers

const COLOUR = /^#[0-9a-f]{6}$/i;

const PRINTABLE_ASCII = /^[ -~]$/;

const SPRITE_KEYS = new Set(['frames']);

const SPRITE_NAME = /^[a-z0-9-]+$/;

const TOP_LEVEL_KEYS = new Set(['palette', 'sprites']);

/** The palette as read: its valid entries, and the index of every character that it declares. */
interface ReadPalette {
  readonly entries: PaletteEntry[];
  readonly indexByKey: ReadonlyMap<string, number>;
}

/** Returns the size of a sprite's first frame, against which every frame is measured, when it can be measured. */
function measureFirstFrame(frame: unknown): { height: number; width: number } | undefined {
  if (!Array.isArray(frame) || frame.length === 0) return undefined;
  const [firstRow] = frame;
  if (typeof firstRow !== 'string' || firstRow.length === 0) return undefined;
  return { height: frame.length, width: [...firstRow].length };
}

/** Converts `#rrggbb` to its three channel values. */
function parseColour(colour: string): [number, number, number] {
  return [
    Number.parseInt(colour.slice(1, 3), 16),
    Number.parseInt(colour.slice(3, 5), 16),
    Number.parseInt(colour.slice(5, 7), 16),
  ];
}

/** Validates one frame, appending each problem to `problems` and returning its rows of indices when it has none. */
function readFrame(
  frame: unknown,
  label: string,
  reference: { height: number; width: number } | undefined,
  palette: ReadPalette,
  problems: string[],
): number[][] | undefined {
  if (!Array.isArray(frame) || frame.length === 0) {
    problems.push(`${label}: must be a non-empty list of rows`);
    return undefined;
  }
  const before = problems.length;
  if (reference !== undefined && frame.length !== reference.height) {
    problems.push(`${label}: has ${frame.length} rows; frame 1 has ${reference.height}`);
  }

  const rows: number[][] = [];
  for (const [rowIndex, row] of frame.entries()) {
    const rowLabel = `${label}, row ${rowIndex + 1}`;
    if (typeof row !== 'string') {
      problems.push(`${rowLabel}: must be a string of palette characters`);
      continue;
    }
    const characters = [...row];
    if (characters.length === 0) {
      problems.push(`${rowLabel}: is empty`);
      continue;
    }
    if (reference !== undefined && characters.length !== reference.width) {
      problems.push(`${rowLabel}: has ${characters.length} pixels; row 1 of frame 1 has ${reference.width}`);
    }
    const indices: number[] = [];
    for (const [column, character] of characters.entries()) {
      const index = palette.indexByKey.get(character);
      if (index === undefined) {
        problems.push(`${rowLabel}, column ${column + 1}: ${JSON.stringify(character)} is not in the palette`);
      } else {
        indices.push(index);
      }
    }
    rows.push(indices);
  }
  return problems.length === before ? rows : undefined;
}

/**
 * Validates the palette, appending each problem to `problems`. Every character that the palette declares is indexed,
 * even one whose colour is invalid, so that a bad colour is not reported again as a missing character in each row.
 */
function readPalette(palette: unknown, problems: string[]): ReadPalette {
  const entries: PaletteEntry[] = [];
  const indexByKey = new Map<string, number>();
  if (palette === undefined) {
    problems.push('palette: missing; it must map each character to a colour');
    return { entries, indexByKey };
  }
  if (!isRecord(palette)) {
    problems.push('palette: must be an object that maps each character to a colour');
    return { entries, indexByKey };
  }

  const keys = Object.keys(palette);
  if (keys.length === 0) problems.push('palette: must declare at least one entry');
  if (keys.length > MAX_PALETTE_ENTRIES) {
    problems.push(`palette: declares ${keys.length} entries; at most ${MAX_PALETTE_ENTRIES} are allowed`);
  }
  for (const key of keys) {
    const label = `palette key ${JSON.stringify(key)}`;
    if (!PRINTABLE_ASCII.test(key)) {
      problems.push(`${label}: must be one printable ASCII character`);
      continue;
    }
    indexByKey.set(key, entries.length);
    const colour = palette[key];
    if (colour === null) {
      entries.push({ key, rgb: undefined });
    } else if (typeof colour === 'string' && COLOUR.test(colour)) {
      entries.push({ key, rgb: parseColour(colour) });
    } else {
      problems.push(`${label}: ${JSON.stringify(colour)} is not a colour; use #rrggbb, or null for transparent`);
      entries.push({ key, rgb: undefined });
    }
  }
  return { entries, indexByKey };
}

/** Validates one sprite, appending each problem to `problems` and returning the sprite when it has none. */
function readSprite(name: string, sprite: unknown, palette: ReadPalette, problems: string[]): Sprite | undefined {
  const label = `sprite ${JSON.stringify(name)}`;
  const before = problems.length;
  if (!SPRITE_NAME.test(name)) problems.push(`${label}: the name must match [a-z0-9-]+`);
  if (!isRecord(sprite)) {
    problems.push(`${label}: must be an object with frames`);
    return undefined;
  }
  for (const key of Object.keys(sprite)) {
    if (!SPRITE_KEYS.has(key)) problems.push(`${label}: unknown key ${JSON.stringify(key)}; a sprite takes frames`);
  }
  const { frames } = sprite;
  if (!Array.isArray(frames) || frames.length === 0) {
    problems.push(`${label}: frames must be a non-empty list of frames`);
    return undefined;
  }

  const reference = measureFirstFrame(frames[0]);
  const parsed: number[][][] = [];
  for (const [index, frame] of frames.entries()) {
    const rows = readFrame(frame, `${label}, frame ${index + 1}`, reference, palette, problems);
    if (rows !== undefined) parsed.push(rows);
  }
  if (problems.length !== before || reference === undefined) return undefined;
  return { frames: parsed, height: reference.height, name, width: reference.width };
}

/** Validates the sprites, appending each problem to `problems` and returning the valid ones in key order. */
function readSprites(sprites: unknown, palette: ReadPalette, problems: string[]): Sprite[] {
  if (sprites === undefined) {
    problems.push('sprites: missing; it must map each sprite name to its frames');
    return [];
  }
  if (!isRecord(sprites)) {
    problems.push('sprites: must be an object that maps each sprite name to its frames');
    return [];
  }
  const names = Object.keys(sprites);
  if (names.length === 0) problems.push('sprites: must declare at least one sprite');

  const result: Sprite[] = [];
  for (const name of names) {
    const sprite = readSprite(name, sprites[name], palette, problems);
    if (sprite !== undefined) result.push(sprite);
  }
  return result;
}

// endregion | Helpers
