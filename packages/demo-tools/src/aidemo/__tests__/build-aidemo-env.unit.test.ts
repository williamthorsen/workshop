import { describe, expect, it } from 'vitest';

import { buildAidemoEnv } from '../build-aidemo-env.ts';

describe(buildAidemoEnv, () => {
  it('removes every inherited OpenAI variable and keeps the rest', () => {
    const env = buildAidemoEnv(
      { AIDEMO_OPENAI_BASE_URL: 'u', OPENAI_API_KEY: 'k', OPENAI_BASE_URL: 'b', PATH: '/bin' },
      { AIDEMO_TTS_PROVIDER: 'local' },
    );

    expect(env).toStrictEqual({ AIDEMO_TTS_PROVIDER: 'local', PATH: '/bin' });
  });

  it('keeps an OpenAI variable that the configuration declares, even when empty', () => {
    const env = buildAidemoEnv({ OPENAI_API_KEY: 'inherited', OPENAI_BASE_URL: 'b' }, { OPENAI_API_KEY: '' });

    expect(env).toStrictEqual({ OPENAI_API_KEY: '' });
  });

  it('lets a declared value override an inherited one', () => {
    expect(buildAidemoEnv({ AIDEMO_VOICE: 'a' }, { AIDEMO_VOICE: 'b' })).toStrictEqual({ AIDEMO_VOICE: 'b' });
  });
});
