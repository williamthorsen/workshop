import { describe, expect, it } from 'vitest';

import { resolveVoice } from '../resolve-voice.ts';

describe(resolveVoice, () => {
  it('defaults to the openai provider and the marin voice', () => {
    expect(resolveVoice([], {}, {})).toStrictEqual({ provider: 'openai', voiceId: 'marin' });
  });

  it.each([
    [['--tts', 'local'], 'local'],
    [['--tts=elevenlabs'], 'elevenlabs'],
    [['--tts', 'local', '--tts=openai'], 'openai'],
  ])('takes the provider from the last --tts in %o, over AIDEMO_TTS_PROVIDER', (options, expected) => {
    expect(resolveVoice(options, { AIDEMO_TTS_PROVIDER: 'other' }, {}).provider).toBe(expected);
  });

  it('takes the provider from AIDEMO_TTS_PROVIDER without --tts', () => {
    expect(resolveVoice([], { AIDEMO_TTS_PROVIDER: 'local' }, {}).provider).toBe('local');
  });

  it("keeps the storyboard's voice whatever the provider", () => {
    const storyboard = { voice: { voiceId: 'af_bella' } };

    expect(resolveVoice(['--tts', 'local'], { AIDEMO_KOKORO_VOICE: 'af_sky' }, storyboard)).toStrictEqual({
      provider: 'local',
      voiceId: 'af_bella',
    });
  });

  it.each([
    ['local', {}, 'af_heart'],
    ['local', { AIDEMO_KOKORO_VOICE: 'af_sky' }, 'af_sky'],
    ['elevenlabs', {}, '21m00Tcm4TlvDq8ikWAM'],
    ['elevenlabs', { AIDEMO_ELEVENLABS_VOICE: 'voice-1' }, 'voice-1'],
  ])('replaces marin with the default voice of %s', (provider, env, expected) => {
    expect(resolveVoice(['--tts', provider], env, { voice: { voiceId: 'marin' } }).voiceId).toBe(expected);
  });

  it.each([[undefined], ['not json'], [{ voice: 'x' }], [{ voice: { voiceId: 7 } }]])(
    'takes the default voice from a storyboard without a voice id: %o',
    (storyboard) => {
      expect(resolveVoice([], {}, storyboard).voiceId).toBe('marin');
    },
  );
});
