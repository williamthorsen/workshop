import { describeError } from '@williamthorsen/toolbelt.errors';

import { measureDirSize } from '../portable/measure-dir-size.ts';
import { type HttpResponse, postJson } from '../portable/post-json.ts';
import { SPEECH_CONTENT_TYPE, SPEECH_PATH, type SpeechRequestBody } from './mlx-audio/build-speech-request.ts';

/** The first speech request to a freshly started server, and what its failures name. */
export interface FirstSpeechRequest {
  readonly baseUrl: string;
  readonly body: SpeechRequestBody;
  readonly logPath: string;
  /** The model's Hugging Face ID. */
  readonly model: string;
  readonly modelDir: string;
}

/** How long synthesis may take once the model is loaded, and an override of the load's limit, for tests. */
export interface FirstSpeechOptions {
  readonly loadLimitMs?: number;
  readonly report: (line: string) => void;
  readonly synthesisLimitMs: number;
}

/** The outcome of the first speech request: the audio, or what stopped it. */
export type FirstSpeechOutcome = { ok: true; audio: Buffer } | { ok: false; message: string };

/** The time that every load may take, whatever the model's size, for a load slowed by memory pressure. */
const LOAD_BASE_MS = 10 * 60 * 1000;

/** The slowest rate at which a load is expected to read the model: that of a slow external disk. */
const LOAD_MIN_BYTES_PER_MS = 200_000;

/**
 * Sends the first speech request, which loads the model, under two limits: one for the load, which scales with the
 * model directory's size, and one for the synthesis that follows. mlx-audio loads the model before it sends the
 * response's headers, so the headers mark the end of the load.
 */
export async function requestFirstSpeech(
  { baseUrl, body, logPath, model, modelDir }: FirstSpeechRequest,
  { loadLimitMs, report, synthesisLimitMs }: FirstSpeechOptions,
): Promise<FirstSpeechOutcome> {
  let modelBytes: number;
  try {
    modelBytes = measureDirSize(modelDir);
  } catch (error) {
    return { ok: false, message: `cannot measure the size of ${modelDir} (${describeError(error)})` };
  }
  const loadLimit = loadLimitMs ?? computeLoadLimitMs(modelBytes);

  report(`loading ${model}`);
  const startedAt = Date.now();
  let loadedAt: number | undefined;
  const aborter = new AbortController();
  let timer = setTimeout(() => aborter.abort(), loadLimit);

  let response: HttpResponse;
  try {
    response = await postJson(`${baseUrl}${SPEECH_PATH}`, body, aborter.signal, (status) => {
      // A failed load also answers with headers, carrying its error status.
      if (status !== 200) return;
      loadedAt = Date.now();
      report(`loaded ${model} in ${formatSeconds(loadedAt - startedAt)} s; synthesizing speech`);
      clearTimeout(timer);
      timer = setTimeout(() => aborter.abort(), synthesisLimitMs);
    });
  } catch (error) {
    if (!aborter.signal.aborted) {
      return { ok: false, message: `the speech request failed (${describeError(error)}); see ${logPath}` };
    }
    const message =
      loadedAt === undefined
        ? `the voice-clone server did not load ${model} within ${formatSeconds(loadLimit)} s, the limit for its ${formatGigabytes(modelBytes)} GB`
        : `the voice-clone server did not synthesize speech within ${formatSeconds(synthesisLimitMs)} s`;
    return { ok: false, message: `${message}; see ${logPath}` };
  } finally {
    clearTimeout(timer);
  }

  if (response.status !== 200) {
    const detail = response.body.toString('utf8').slice(0, 500);
    return { ok: false, message: `the voice-clone server answered ${response.status} (${detail}); see ${logPath}` };
  }
  if (response.contentType?.startsWith(SPEECH_CONTENT_TYPE) !== true || response.body.length === 0) {
    return {
      ok: false,
      message: `the voice-clone server answered without ${SPEECH_CONTENT_TYPE} audio; see ${logPath}`,
    };
  }
  return { ok: true, audio: response.body };
}

/** Returns how long loading a model of `modelBytes` may take. */
export function computeLoadLimitMs(modelBytes: number): number {
  return LOAD_BASE_MS + Math.ceil(modelBytes / LOAD_MIN_BYTES_PER_MS);
}

// region | Helpers

/** Formats a size in decimal gigabytes, to one decimal place. */
function formatGigabytes(bytes: number): string {
  return (bytes / 1e9).toFixed(1);
}

/** Formats a duration in whole seconds. */
function formatSeconds(ms: number): string {
  return String(Math.round(ms / 1000));
}

// endregion | Helpers
