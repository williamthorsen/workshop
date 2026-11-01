import { isRecord } from '../portable/is-record.ts';

/** The TTS provider and voice that aidemo narrates a take with. */
export interface ResolvedVoice {
  readonly provider: string;
  readonly voiceId: string;
}

/** The storyboard's voice id when it sets none, which is an OpenAI voice. */
const DEFAULT_VOICE_ID = 'marin';

/**
 * Resolves the voice that aidemo 0.20.0 narrates with, by its rules in `src/config.ts`, `src/voice.ts`, and
 * `src/voice-local.ts`: the provider is the last `--tts` among `options`, then `AIDEMO_TTS_PROVIDER`, then `openai`;
 * the voice is the storyboard's `voice.voiceId`, then `marin`, which the `local` and `elevenlabs` providers replace
 * with their own default voice. `env` is the environment that aidemo sees once it has loaded the root's `.env`.
 * Per-scene voices are not resolved.
 */
export function resolveVoice(
  options: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  storyboard: unknown,
): ResolvedVoice {
  const provider = findLastOptionValue(options, '--tts') ?? (env['AIDEMO_TTS_PROVIDER'] || 'openai');
  const voiceId = readStoryboardVoiceId(storyboard) ?? DEFAULT_VOICE_ID;
  if (voiceId !== DEFAULT_VOICE_ID) return { provider, voiceId };

  if (provider === 'local') return { provider, voiceId: env['AIDEMO_KOKORO_VOICE'] || 'af_heart' };
  if (provider === 'elevenlabs') {
    return { provider, voiceId: env['AIDEMO_ELEVENLABS_VOICE'] || '21m00Tcm4TlvDq8ikWAM' };
  }

  return { provider, voiceId };
}

// region | Helpers

/** Returns the value of the last `name` option, written as `name value` or `name=value`. */
function findLastOptionValue(options: readonly string[], name: string): string | undefined {
  let value: string | undefined;
  for (const [index, option] of options.entries()) {
    if (option === name) value = options[index + 1];
    else if (option.startsWith(`${name}=`)) value = option.slice(name.length + 1);
  }

  return value;
}

/** Returns the storyboard's `voice.voiceId` when it is a string. */
function readStoryboardVoiceId(storyboard: unknown): string | undefined {
  if (!isRecord(storyboard)) return undefined;

  const voice = storyboard['voice'];
  if (!isRecord(voice)) return undefined;

  const voiceId = voice['voiceId'];
  return typeof voiceId === 'string' ? voiceId : undefined;
}

// endregion | Helpers
