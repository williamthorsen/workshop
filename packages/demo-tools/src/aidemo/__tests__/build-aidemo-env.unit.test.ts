import { describe, expect, it } from 'vitest';

import { buildAidemoEnv, resolveDefaultProfileDir } from '../build-aidemo-env.ts';

const PROFILE = '/home/demo/.local/share/thor-demo/chrome-profiles/demos';

describe(buildAidemoEnv, () => {
  it('removes every inherited OpenAI variable and keeps the rest', () => {
    const env = buildAidemoEnv(
      { AIDEMO_OPENAI_BASE_URL: 'u', OPENAI_API_KEY: 'k', OPENAI_BASE_URL: 'b', PATH: '/bin' },
      { AIDEMO_TTS_PROVIDER: 'local' },
      PROFILE,
    );

    expect(env).toStrictEqual({ AIDEMO_CHROME_PROFILE: PROFILE, AIDEMO_TTS_PROVIDER: 'local', PATH: '/bin' });
  });

  it('keeps an OpenAI variable that the configuration declares, even when empty', () => {
    const env = buildAidemoEnv({ OPENAI_API_KEY: 'inherited', OPENAI_BASE_URL: 'b' }, { OPENAI_API_KEY: '' }, PROFILE);

    expect(env).toStrictEqual({ AIDEMO_CHROME_PROFILE: PROFILE, OPENAI_API_KEY: '' });
  });

  it('lets a declared value override an inherited one', () => {
    expect(buildAidemoEnv({ AIDEMO_VOICE: 'a' }, { AIDEMO_VOICE: 'b' }, PROFILE)).toMatchObject({ AIDEMO_VOICE: 'b' });
  });

  it('prefers a declared profile to an inherited one, and either to the default', () => {
    const inherited = { AIDEMO_CHROME_PROFILE: '/inherited' };

    expect(buildAidemoEnv(inherited, { AIDEMO_CHROME_PROFILE: '/declared' }, PROFILE)).toStrictEqual({
      AIDEMO_CHROME_PROFILE: '/declared',
    });
    expect(buildAidemoEnv(inherited, {}, PROFILE)).toStrictEqual(inherited);
  });

  it('replaces an empty profile with the default', () => {
    expect(buildAidemoEnv({ AIDEMO_CHROME_PROFILE: '' }, {}, PROFILE)).toStrictEqual({
      AIDEMO_CHROME_PROFILE: PROFILE,
    });
  });
});

describe(resolveDefaultProfileDir, () => {
  it('keys the profile by the archive label under the home directory', () => {
    expect(resolveDefaultProfileDir('/home/demo', 'demos')).toBe(PROFILE);
  });
});
