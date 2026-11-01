import { describe, expect, it } from 'vitest';

import { buildSpeechRequest } from '../build-speech-request.ts';

describe(buildSpeechRequest, () => {
  it('clones the reference voice through the local model directory, requesting mp3, without a voice', () => {
    const body = buildSpeechRequest({
      input: 'Hello.',
      modelDir: '/voice/models/org--model',
      referenceAudio: '/voice/profile/reference.wav',
      referenceText: 'A reference.',
    });

    expect(body).toStrictEqual({
      input: 'Hello.',
      model: '/voice/models/org--model',
      ref_audio: '/voice/profile/reference.wav',
      ref_text: 'A reference.',
      response_format: 'mp3',
    });
    expect(body).not.toHaveProperty('voice');
  });
});
