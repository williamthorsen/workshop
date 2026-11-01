import { readFileSync } from 'node:fs';
import http from 'node:http';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { isRecord } from '../portable/is-record.ts';
import { postJson } from '../portable/post-json.ts';
import { SERVER_HOST } from './mlx-audio/build-server-launch.ts';
import { buildSpeechRequest, SPEECH_PATH } from './mlx-audio/build-speech-request.ts';

/** Where the proxy forwards speech, and the voice profile that it clones. */
export interface SpeechProxyOptions {
  readonly modelDir: string;
  readonly referenceAudio: string;
  /** The transcript file of the reference recording. */
  readonly referenceTranscript: string;
  /** The base URL of the voice-clone server. */
  readonly upstreamUrl: string;
}

/** A running speech proxy. Disposing of it stops it. */
export interface SpeechProxy extends AsyncDisposable {
  readonly baseUrl: string;
  readonly stop: () => Promise<void>;
}

/**
 * Starts a loopback-only HTTP server that accepts OpenAI-shaped speech requests and forwards each as a request that
 * clones the profile's voice, keeping only the text to speak. A request from a web page is answered 403, and every
 * other request 404.
 */
export async function startSpeechProxy(options: SpeechProxyOptions): Promise<SpeechProxy> {
  const referenceText = readFileSync(options.referenceTranscript, 'utf8').trim();
  const upstream = `${options.upstreamUrl}${SPEECH_PATH}`;

  const server = http.createServer((request, response) => {
    void handleRequest(request, response);
  });

  async function handleRequest(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    // A browser sends `Origin` on every POST, and aidemo's Node client never does.
    if (request.headers.origin !== undefined) {
      sendText(response, 403, 'requests from a web page are refused');
      return;
    }
    if (request.method !== 'POST' || request.url !== SPEECH_PATH) {
      sendText(response, 404, `not found: ${request.method ?? ''} ${request.url ?? ''}`);
      return;
    }

    const input = readInput(await readBody(request));
    if (input === undefined) {
      sendText(response, 400, 'expected a JSON body with a string "input"');
      return;
    }

    // Abandon the synthesis when the client gives up on it.
    const aborter = new AbortController();
    response.once('close', () => {
      if (!response.writableFinished) aborter.abort();
    });

    const body = buildSpeechRequest({
      input,
      modelDir: options.modelDir,
      referenceAudio: options.referenceAudio,
      referenceText,
    });
    try {
      const answer = await postJson(upstream, body, aborter.signal);
      response.writeHead(answer.status, {
        'content-length': answer.body.length,
        ...(answer.contentType !== undefined && { 'content-type': answer.contentType }),
      });
      response.end(answer.body);
    } catch (error) {
      if (!aborter.signal.aborted) sendText(response, 502, `the voice-clone server failed: ${describeError(error)}`);
    }
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, SERVER_HOST, resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    server.close();
    throw new Error(`cannot read the port that the speech proxy bound on ${SERVER_HOST}`);
  }

  let stopping: Promise<void> | undefined;
  function stop(): Promise<void> {
    stopping ??= new Promise((resolve) => {
      server.close(() => {
        resolve();
      });
      server.closeAllConnections();
    });
    return stopping;
  }

  return { baseUrl: `http://${SERVER_HOST}:${address.port}`, stop, [Symbol.asyncDispose]: stop };
}

// region | Helpers

/** Reads a request's whole body. */
async function readBody(request: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    if (Buffer.isBuffer(chunk)) chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** Returns the `input` of a JSON speech request, or `undefined` when the body is not one. */
function readInput(body: Buffer): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString('utf8'));
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;

  const { input } = parsed;
  return typeof input === 'string' ? input : undefined;
}

/** Answers with a plain-text body. */
function sendText(response: http.ServerResponse, status: number, text: string): void {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(`${text}\n`);
}

// endregion | Helpers
