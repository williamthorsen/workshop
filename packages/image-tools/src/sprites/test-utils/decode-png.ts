import { crc32, inflateSync } from 'node:zlib';

/** The parts of an indexed-colour PNG that the sprite tests assert on. */
export interface DecodedPng {
  readonly bitDepth: number;
  readonly chunkTypes: readonly string[];
  readonly colourType: number;
  readonly height: number;
  /** The `PLTE` entries as `[r, g, b]` triples. */
  readonly palette: readonly (readonly number[])[];
  /** The rows of palette indices, filter bytes removed. */
  readonly rows: readonly (readonly number[])[];
  /** The `tRNS` alpha bytes, or `undefined` when the chunk is absent. */
  readonly transparency: readonly number[] | undefined;
  readonly width: number;
}

/**
 * Decodes an 8-bit indexed-colour PNG whose scanlines all use filter type 0, throwing on a bad signature, a bad CRC,
 * or any other filter type.
 */
export function decodePng(png: Buffer): DecodedPng {
  if (!png.subarray(0, 8).equals(SIGNATURE)) throw new Error('The PNG signature is wrong.');

  const chunks = readChunks(png);
  const header = requireChunk(chunks, 'IHDR');
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const inflated = inflateSync(Buffer.concat(chunks.filter(({ type }) => type === 'IDAT').map(({ data }) => data)));

  const rows: number[][] = [];
  for (let y = 0; y < height; y++) {
    const start = y * (width + 1);
    if (inflated[start] !== 0) throw new Error(`Row ${y} uses filter type ${inflated[start]}, not 0.`);
    rows.push([...inflated.subarray(start + 1, start + 1 + width)]);
  }

  const plte = requireChunk(chunks, 'PLTE');
  const palette: number[][] = [];
  for (let offset = 0; offset < plte.length; offset += 3) palette.push([...plte.subarray(offset, offset + 3)]);
  const trns = chunks.find(({ type }) => type === 'tRNS');

  return {
    bitDepth: header.readUInt8(8),
    chunkTypes: chunks.map(({ type }) => type),
    colourType: header.readUInt8(9),
    height,
    palette,
    rows,
    transparency: trns === undefined ? undefined : [...trns.data],
    width,
  };
}

// region | Helpers

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Splits a PNG after its signature into chunks, verifying each chunk's CRC. */
function readChunks(png: Buffer): { data: Buffer; type: string }[] {
  const chunks: { data: Buffer; type: string }[] = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const typeAndData = png.subarray(offset + 4, offset + 8 + length);
    const type = typeAndData.subarray(0, 4).toString('latin1');
    if (png.readUInt32BE(offset + 8 + length) !== crc32(typeAndData)) throw new Error(`The ${type} CRC is wrong.`);
    chunks.push({ data: typeAndData.subarray(4), type });
    offset += 12 + length;
  }
  return chunks;
}

/** Returns the data of the chunk of `type`, throwing when the PNG lacks one. */
function requireChunk(chunks: readonly { data: Buffer; type: string }[], type: string): Buffer {
  const chunk = chunks.find((candidate) => candidate.type === type);
  if (chunk === undefined) throw new Error(`The PNG lacks a ${type} chunk.`);
  return chunk.data;
}

// endregion | Helpers
