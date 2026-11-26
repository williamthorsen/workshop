import type { RawData } from 'ws';

/** Returns the text of a frame, which `ws` may deliver as a buffer, a list of buffers, or an array buffer. */
export function rawDataToString(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return data.toString('utf8');
}
