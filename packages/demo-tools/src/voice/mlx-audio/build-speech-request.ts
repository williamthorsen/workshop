/** The body of a request to clone a voice through mlx-audio's speech endpoint. */
export interface SpeechRequestBody {
  readonly input: string;
  /** The model's local directory, which keeps the server from resolving a Hugging Face ID. */
  readonly model: string;
  readonly ref_audio: string;
  readonly ref_text: string;
  readonly response_format: 'mp3';
}

/** What a speech request takes: the text to speak, the model's directory, and the voice profile's reference. */
export interface SpeechRequestInput {
  readonly input: string;
  readonly modelDir: string;
  readonly referenceAudio: string;
  readonly referenceText: string;
}

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
}: SpeechRequestInput): SpeechRequestBody {
  return { input, model: modelDir, ref_audio: referenceAudio, ref_text: referenceText, response_format: 'mp3' };
}
