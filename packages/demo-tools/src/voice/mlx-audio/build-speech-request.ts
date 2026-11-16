/** A sampling field of mlx-audio's speech request. */
export type SamplingField = (typeof SAMPLING_FIELDS)[number];

/** The body of a request to clone a voice through mlx-audio's speech endpoint. */
export interface SpeechRequestBody extends SpeechSampling {
  readonly input: string;
  /** The model's local directory, which keeps the server from resolving a Hugging Face ID. */
  readonly model: string;
  readonly ref_audio: string;
  readonly ref_text: string;
  readonly response_format: 'mp3';
}

/** What a speech request takes: the text to speak, the model's directory, the profile's reference, and the sampling. */
export interface SpeechRequestInput {
  readonly input: string;
  readonly modelDir: string;
  readonly referenceAudio: string;
  readonly referenceText: string;
  readonly sampling: SpeechSampling;
}

/**
 * Sampling values for a speech request. mlx-audio resolves a field that is absent from the model's config, then from
 * its own default.
 */
export type SpeechSampling = Readonly<Partial<Record<SamplingField, number>>>;

/** The sampling fields of mlx-audio's speech request, as of `MLX_AUDIO_VERSION`. */
export const SAMPLING_FIELDS = ['repetition_penalty', 'temperature', 'top_k', 'top_p'] as const;

/** The content type of a successful response, which the server derives from `response_format`. */
export const SPEECH_CONTENT_TYPE = 'audio/mp3';

/** The speech endpoint, relative to the server's base URL. */
export const SPEECH_PATH = '/v1/audio/speech';

/**
 * Builds the body of a speech request that clones the reference voice. It never sets `voice`, which mlx-audio does
 * not accept together with `ref_audio`.
 */
export function buildSpeechRequest({
  input,
  modelDir,
  referenceAudio,
  referenceText,
  sampling,
}: SpeechRequestInput): SpeechRequestBody {
  return {
    input,
    model: modelDir,
    ref_audio: referenceAudio,
    ref_text: referenceText,
    response_format: 'mp3',
    ...sampling,
  };
}
