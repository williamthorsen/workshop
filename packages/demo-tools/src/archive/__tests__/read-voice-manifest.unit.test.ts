import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { readVoiceManifest } from '../read-voice-manifest.ts';

const MANIFEST = 'audio/voice.json';

describe(readVoiceManifest, () => {
  it("reads each scene's provider and voice in the manifest's order", () => {
    using tree = createTempTree({
      [MANIFEST]: JSON.stringify({
        gapMs: 400,
        scenes: [
          { id: 'intro', file: 'a.mp3', durationMs: 1, provider: 'local', voice: 'af_heart' },
          { id: 'outro', file: 'b.mp3', durationMs: 1, provider: 'openai', voice: 'marin' },
        ],
      }),
    });

    expect(readVoiceManifest(tree.dir)).toStrictEqual({
      ok: true,
      scenes: [
        { id: 'intro', provider: 'local', voiceId: 'af_heart' },
        { id: 'outro', provider: 'openai', voiceId: 'marin' },
      ],
    });
  });

  it('records null for a scene that the manifest records without a provider or voice', () => {
    using tree = createTempTree({ [MANIFEST]: JSON.stringify({ scenes: [{ id: 'intro', durationMs: 1 }] }) });

    expect(readVoiceManifest(tree.dir)).toStrictEqual({
      ok: true,
      scenes: [{ id: 'intro', provider: null, voiceId: null }],
    });
  });

  it.each([
    ['a missing manifest', undefined, /voice\.json not found$/],
    ['a manifest that is not JSON', '{', /voice\.json cannot be read/],
    ['a manifest without scenes', '{"gapMs":0}', /voice\.json does not list its scenes$/],
    ['a scene without an id', '{"scenes":[{"voice":"marin"}]}', /voice\.json lists a scene without an id$/],
  ])('refuses %s, naming the file', (_label, content, expected) => {
    using tree = createTempTree(content === undefined ? { 'audio/.keep': '' } : { [MANIFEST]: content });

    const result = readVoiceManifest(tree.dir);

    expect(result.ok ? '' : result.message).toMatch(expected);
    expect(result.ok ? '' : result.message).toContain(tree.resolve(MANIFEST));
  });
});
