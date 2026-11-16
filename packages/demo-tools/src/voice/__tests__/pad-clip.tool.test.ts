import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { findOnPath } from '../../portable/find-on-path.ts';
import { measureClip } from '../inspect-clip.ts';
import { padClip } from '../pad-clip.ts';

/** One MP3 frame at 44.1 kHz, the precision to which an encoded clip's duration can change. */
const FRAME_SECONDS = 1152 / 44_100;

const hasFfmpeg = findOnPath('ffmpeg', process.env['PATH']) !== undefined;

describe.skipIf(!hasFfmpeg)(padClip, () => {
  it('appends the requested silence to a clip', async () => {
    using tree = createTempTree({});
    const tone = tree.resolve('tone.mp3');
    execFileSync('ffmpeg', [
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=44100:duration=1',
      '-c:a',
      'libmp3lame',
      tone,
    ]);
    const audio = readFileSync(tone);
    const before = await measureClip(audio);

    const after = await measureClip(await padClip(audio, 700));

    expect(Math.abs(after.durationSeconds - before.durationSeconds - 0.7)).toBeLessThanOrEqual(2 * FRAME_SECONDS);
    const trailing = after.silences.at(-1);
    expect(trailing?.endSeconds).toBe(after.durationSeconds);
    expect((trailing?.endSeconds ?? 0) - (trailing?.startSeconds ?? 0)).toBeGreaterThanOrEqual(0.7 - FRAME_SECONDS);
  });
});
