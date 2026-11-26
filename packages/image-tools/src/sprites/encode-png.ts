import { crc32, deflateSync } from 'node:zlib';

import type { PaletteEntry, Sprite } from './parse-sprite-sheet.ts';

/** Encodes a sprite's frames, left to right, as one indexed-colour PNG strip at one pixel per logical pixel. */
export function encodePng(sprite: Sprite, palette: readonly PaletteEntry[]): Buffer {
  const stripWidth = sprite.frames.length * sprite.width;
  const chunks = [
    buildChunk('IHDR', buildHeader(stripWidth, sprite.height)),
    buildChunk('PLTE', Buffer.from(palette.flatMap(({ rgb }) => rgb ?? [0, 0, 0]))),
  ];
  const transparency = buildTransparency(palette);
  if (transparency !== undefined) chunks.push(buildChunk('tRNS', transparency));
  chunks.push(buildChunk('IDAT', deflateSync(buildScanlines(sprite, stripWidth))), buildChunk('IEND', Buffer.alloc(0)));
  return Buffer.concat([PNG_SIGNATURE, ...chunks]);
}

// region | Helpers

const BIT_DEPTH = 8;

const COLOUR_TYPE_INDEXED = 3;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Frames `data` as a PNG chunk: its length, type, data, and the CRC of the type and data. */
function buildChunk(type: string, data: Buffer): Buffer {
  const typeAndData = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

/** Builds the `IHDR` data: the size, bit depth 8, indexed colour, and the default compression, filter, and interlace. */
function buildHeader(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(BIT_DEPTH, 8);
  header.writeUInt8(COLOUR_TYPE_INDEXED, 9);
  return header;
}

/** Lays the frames side by side and prefixes each row of the strip with filter type 0. */
function buildScanlines(sprite: Sprite, stripWidth: number): Buffer {
  const rowLength = 1 + stripWidth;
  const scanlines = Buffer.alloc(rowLength * sprite.height);
  for (const [frameIndex, frame] of sprite.frames.entries()) {
    for (const [y, row] of frame.entries()) {
      scanlines.set(row, y * rowLength + 1 + frameIndex * sprite.width);
    }
  }
  return scanlines;
}

/**
 * Builds the `tRNS` data, one alpha byte per palette entry through the last transparent one, or returns `undefined`
 * when every entry is opaque. Entries after the last byte are opaque by the PNG specification.
 */
function buildTransparency(palette: readonly PaletteEntry[]): Buffer | undefined {
  const last = palette.findLastIndex(({ rgb }) => rgb === undefined);
  if (last === -1) return undefined;
  return Buffer.from(palette.slice(0, last + 1).map(({ rgb }) => (rgb === undefined ? 0 : 255)));
}

// endregion | Helpers
