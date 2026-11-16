import { isRecord } from '@williamthorsen/toolbelt.objects';
import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { shiftGapIntoManifest } from '../shift-gap-into-manifest.ts';

const MANIFEST = {
  gapMs: 300,
  scenes: [
    { id: 'scene-1', file: '/demo/audio/scene-1.mp3', durationMs: 3000, hash: 'abc', provider: 'openai', voice: 'm' },
    { id: 'scene-2', file: '/demo/audio/scene-2.mp3', durationMs: 400 },
  ],
};

describe(shiftGapIntoManifest, () => {
  it('moves the gap out of every scene and into gapMs, keeping every other field', () => {
    using demo = createTempTree({ 'audio/voice.json': JSON.stringify(MANIFEST) });

    expect(shiftGapIntoManifest(demo.dir, 700)).toStrictEqual({ ok: true });

    expect(demo.readJson('audio/voice.json')).toStrictEqual({
      gapMs: 1000,
      scenes: [
        { ...MANIFEST.scenes[0], durationMs: 2300 },
        { ...MANIFEST.scenes[1], durationMs: 0 },
      ],
    });
  });

  it('keeps the length of the narration track that compose fits the footage to, when no scene is clamped', () => {
    const manifest = {
      gapMs: 300,
      scenes: [
        { id: 'a', durationMs: 3000 },
        { id: 'b', durationMs: 1800 },
      ],
    };
    using demo = createTempTree({ 'audio/voice.json': JSON.stringify(manifest) });

    shiftGapIntoManifest(demo.dir, 700);

    expect(sumTrack(demo.readJson('audio/voice.json'))).toBe(sumTrack(manifest));
  });

  it('reports a missing manifest', () => {
    using demo = createTempTree({});

    expect(shiftGapIntoManifest(demo.dir, 700)).toStrictEqual({
      ok: false,
      message: `${demo.resolve('audio/voice.json')} not found`,
    });
  });

  it.each([
    ['unparsable JSON', '{', /cannot be read/],
    ['a manifest without gapMs', JSON.stringify({ scenes: [] }), /does not record a gap and a duration/],
    ['a negative gapMs', JSON.stringify({ gapMs: -1, scenes: [] }), /does not record a gap and a duration/],
    ['a scene without durationMs', JSON.stringify({ gapMs: 300, scenes: [{ id: 'a' }] }), /does not record/],
    ['a string durationMs', JSON.stringify({ gapMs: 300, scenes: [{ durationMs: '9' }] }), /does not record/],
  ])('reports %s without writing the file', (_label, content, expected) => {
    using demo = createTempTree({ 'audio/voice.json': content });

    const outcome = shiftGapIntoManifest(demo.dir, 700);

    expect(outcome.ok ? '' : outcome.message).toMatch(expected);
    expect(demo.read('audio/voice.json')).toBe(content);
  });
});

// region | Helpers

/** Returns the length of the narration track that a manifest describes: each scene's duration plus the gap after it. */
function sumTrack(manifest: unknown): number {
  if (!isRecord(manifest) || typeof manifest['gapMs'] !== 'number' || !Array.isArray(manifest['scenes'])) {
    throw new Error('not a voice manifest');
  }
  const gapMs = manifest['gapMs'];
  return manifest['scenes'].reduce<number>((total, scene: unknown) => {
    if (!isRecord(scene) || typeof scene['durationMs'] !== 'number') throw new Error('not a scene');
    return total + scene['durationMs'] + gapMs;
  }, 0);
}

// endregion | Helpers
