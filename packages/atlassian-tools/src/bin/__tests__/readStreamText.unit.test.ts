import { Readable } from 'node:stream';
import { setImmediate } from 'node:timers/promises';

import { describe, expect, it } from 'vitest';

import { readStreamText } from '../readStreamText.ts';

describe(readStreamText, () => {
  it('joins every chunk that the stream contains', async () => {
    await expect(readStreamText(buildStream(['first ', 'second']))).resolves.toBe('first second');
  });

  it('returns an empty string when the stream contains nothing', async () => {
    await expect(readStreamText(buildStream([]))).resolves.toBe('');
  });

  it('waits for a producer that has not yet written', async () => {
    await expect(readStreamText(Readable.from(emitLate('late'), { objectMode: false }))).resolves.toBe('late');
  });
});

// region | Helpers

/** Builds a byte stream, rather than the object-mode stream to which `Readable.from` defaults, as a pipe is. */
function buildStream(chunks: string[]): Readable {
  return Readable.from(chunks, { objectMode: false });
}

/** Yields one chunk only on a later event-loop turn, as a producer that has to reach a keychain or a network does. */
async function* emitLate(chunk: string): AsyncGenerator<string> {
  await setImmediate();

  yield chunk;
}

// endregion | Helpers
