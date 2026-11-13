import { once } from 'node:events';
import http from 'node:http';
import net from 'node:net';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import type { ClipVerdict } from '../inspect-clip.ts';
import { type SpeechProxyOptions, startSpeechProxy } from '../speech-proxy.ts';

const OPENAI_REQUEST = {
  model: 'mlx-community/model',
  voice: 'marin',
  input: 'Hello from the demo.',
  instructions: 'Speak slowly.',
  response_format: 'mp3',
};

const CLIP: StubAnswer = { body: 'MP3', contentType: 'audio/mp3', status: 200 };

describe(startSpeechProxy, () => {
  it('forwards the text with the voice profile, and without voice or instructions', async () => {
    await using upstream = await startUpstream(CLIP);
    using tree = createTempTree({ 'reference.wav': 'RIFF', 'transcript.txt': '  The reference text.\n' });
    await using proxy = await startSpeechProxy({
      inspectClip: acceptClip,
      modelDir: '/voice/models/model',
      referenceAudio: tree.resolve('reference.wav'),
      referenceTranscript: tree.resolve('transcript.txt'),
      upstreamUrl: upstream.baseUrl,
    });

    const response = await postSpeech(proxy.baseUrl, OPENAI_REQUEST);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/mp3');
    await expect(response.text()).resolves.toBe('MP3');
    expect(upstream.requests).toStrictEqual([
      {
        input: 'Hello from the demo.',
        model: '/voice/models/model',
        ref_audio: tree.resolve('reference.wav'),
        ref_text: 'The reference text.',
        response_format: 'mp3',
      },
    ]);
  });

  it('listens on loopback only', async () => {
    await using upstream = await startUpstream(CLIP);
    using tree = createTempTree({ 'transcript.txt': 'text' });
    await using proxy = await startSpeechProxy(buildOptions(tree.resolve('transcript.txt'), upstream.baseUrl));

    expect(new URL(proxy.baseUrl).hostname).toBe('127.0.0.1');
  });

  it('relays a 4xx answer unchanged', async () => {
    await using upstream = await startUpstream({
      body: '{"detail":"bad"}',
      contentType: 'application/json',
      status: 422,
    });
    using tree = createTempTree({ 'transcript.txt': 'text' });
    await using proxy = await startSpeechProxy(buildOptions(tree.resolve('transcript.txt'), upstream.baseUrl));

    const response = await postSpeech(proxy.baseUrl, OPENAI_REQUEST);

    expect(response.status).toBe(422);
    await expect(response.text()).resolves.toBe('{"detail":"bad"}');
    expect(proxy.readFailure()).toBeUndefined();
  });

  it('refuses a rejected clip with a 502 that the SDK does not retry, recording the text and the reason', async () => {
    await using upstream = await startUpstream({ ...CLIP, body: 'SILENT' });
    using tree = createTempTree({ 'transcript.txt': 'text' });
    await using proxy = await startSpeechProxy(buildOptions(tree.resolve('transcript.txt'), upstream.baseUrl));

    const response = await postSpeech(proxy.baseUrl, OPENAI_REQUEST);

    expect(response.status).toBe(502);
    expect(response.headers.get('x-should-retry')).toBe('false');
    await expect(response.json()).resolves.toStrictEqual({
      error: { message: 'the voice clone could not speak the text: silent throughout' },
    });
    expect(upstream.requests).toHaveLength(1);
    expect(proxy.readFailure()).toStrictEqual({ input: 'Hello from the demo.', reason: 'silent throughout' });
  });

  it('clears the failure when the next request succeeds', async () => {
    await using upstream = await startUpstream({ ...CLIP, body: 'SILENT' }, CLIP);
    using tree = createTempTree({ 'transcript.txt': 'text' });
    await using proxy = await startSpeechProxy(buildOptions(tree.resolve('transcript.txt'), upstream.baseUrl));

    expect((await postSpeech(proxy.baseUrl, OPENAI_REQUEST)).status).toBe(502);
    expect((await postSpeech(proxy.baseUrl, OPENAI_REQUEST)).status).toBe(200);
    expect(proxy.readFailure()).toBeUndefined();
  });

  it('abandons a request over budget', async () => {
    await using upstream = await startUpstream({ ...CLIP, delayMs: 2000 });
    using tree = createTempTree({ 'transcript.txt': 'text' });
    await using proxy = await startSpeechProxy({
      ...buildOptions(tree.resolve('transcript.txt'), upstream.baseUrl),
      requestBudgetMs: 100,
    });

    expect((await postSpeech(proxy.baseUrl, OPENAI_REQUEST)).status).toBe(502);
    expect(proxy.readFailure()?.reason).toBe('no answer within 0.1 s');
  });

  it('refuses a 5xx answer', async () => {
    await using upstream = await startUpstream({ body: 'boom', contentType: 'text/plain', status: 500 });
    using tree = createTempTree({ 'transcript.txt': 'text' });
    await using proxy = await startSpeechProxy(buildOptions(tree.resolve('transcript.txt'), upstream.baseUrl));

    expect((await postSpeech(proxy.baseUrl, OPENAI_REQUEST)).status).toBe(502);
    expect(proxy.readFailure()?.reason).toBe('the voice-clone server answered 500');
  });

  it('refuses a request whose upstream cannot be reached', async () => {
    const upstream = await startUpstream(CLIP);
    const { baseUrl } = upstream;
    await upstream.stop();
    using tree = createTempTree({ 'transcript.txt': 'text' });
    await using proxy = await startSpeechProxy(buildOptions(tree.resolve('transcript.txt'), baseUrl));

    expect((await postSpeech(proxy.baseUrl, OPENAI_REQUEST)).status).toBe(502);
    expect(proxy.readFailure()?.reason).toMatch(/^the voice-clone server failed: /);
  });

  it('refuses a clip that cannot be measured', async () => {
    await using upstream = await startUpstream(CLIP);
    using tree = createTempTree({ 'transcript.txt': 'text' });
    await using proxy = await startSpeechProxy({
      ...buildOptions(tree.resolve('transcript.txt'), upstream.baseUrl),
      inspectClip: () => Promise.reject(new Error('spawn ffmpeg ENOENT')),
    });

    expect((await postSpeech(proxy.baseUrl, OPENAI_REQUEST)).status).toBe(502);
    expect(proxy.readFailure()?.reason).toBe('ffmpeg cannot measure the clip: spawn ffmpeg ENOENT');
  });

  it('abandons the upstream request without recording a failure when the client disconnects', async () => {
    await using upstream = await startUpstream({ ...CLIP, delayMs: 2000 });
    using tree = createTempTree({ 'transcript.txt': 'text' });
    await using proxy = await startSpeechProxy(buildOptions(tree.resolve('transcript.txt'), upstream.baseUrl));

    const request = fetch(`${proxy.baseUrl}/v1/audio/speech`, {
      body: JSON.stringify(OPENAI_REQUEST),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      signal: AbortSignal.timeout(100),
    });

    await expect(request).rejects.toThrow('aborted');
    await expect(upstream.firstClose).resolves.toStrictEqual({ answered: false });
    expect(upstream.requests).toHaveLength(1);
    expect(proxy.readFailure()).toBeUndefined();
  });

  it('drops a request that the client abandons mid-body, and keeps serving', async () => {
    await using upstream = await startUpstream(CLIP);
    using tree = createTempTree({ 'transcript.txt': 'text' });
    await using proxy = await startSpeechProxy(buildOptions(tree.resolve('transcript.txt'), upstream.baseUrl));

    await abandonMidBody(proxy.baseUrl);
    const response = await postSpeech(proxy.baseUrl, OPENAI_REQUEST);

    expect(response.status).toBe(200);
    expect(upstream.requests).toHaveLength(1);
    expect(proxy.readFailure()).toBeUndefined();
  });

  it('answers 400 to a body without a string input, and 404 to any other request', async () => {
    await using upstream = await startUpstream(CLIP);
    using tree = createTempTree({ 'transcript.txt': 'text' });
    await using proxy = await startSpeechProxy(buildOptions(tree.resolve('transcript.txt'), upstream.baseUrl));

    expect((await postSpeech(proxy.baseUrl, { voice: 'marin' })).status).toBe(400);
    expect((await fetch(`${proxy.baseUrl}/v1/audio/speech`)).status).toBe(404);
    expect((await fetch(`${proxy.baseUrl}/v1/audio/transcriptions`, { method: 'POST' })).status).toBe(404);
    expect(upstream.requests).toStrictEqual([]);
  });

  it('answers 403 to a request that a web page sent, without forwarding it', async () => {
    await using upstream = await startUpstream(CLIP);
    using tree = createTempTree({ 'transcript.txt': 'text' });
    await using proxy = await startSpeechProxy(buildOptions(tree.resolve('transcript.txt'), upstream.baseUrl));

    const response = await fetch(`${proxy.baseUrl}/v1/audio/speech`, {
      body: JSON.stringify(OPENAI_REQUEST),
      headers: { 'content-type': 'text/plain', origin: 'https://example.com' },
      method: 'POST',
    });

    expect(response.status).toBe(403);
    expect(upstream.requests).toStrictEqual([]);
  });
});

// region | Helpers

/** Sends a speech request that promises more body than it writes, then closes the connection. */
async function abandonMidBody(baseUrl: string): Promise<void> {
  const { hostname, port } = new URL(baseUrl);
  const socket = net.connect(Number(port), hostname);
  await once(socket, 'connect');
  const head = `POST /v1/audio/speech HTTP/1.1\r\nHost: ${hostname}\r\nContent-Length: 100\r\n\r\n`;
  await new Promise<void>((resolve, reject) => {
    socket.write(`${head}{"input":`, (error) => (error ? reject(error) : resolve()));
  });
  socket.destroy();
}

/** One answer of the stub voice-clone server, sent after an optional delay. */
interface StubAnswer {
  readonly body: string;
  readonly contentType: string;
  readonly delayMs?: number;
  readonly status: number;
}

/** Judges a clip whose body reads `SILENT` as silent, and any other clip as good. */
function acceptClip(audio: Buffer): Promise<ClipVerdict> {
  return Promise.resolve(
    audio.toString('utf8') === 'SILENT' ? { ok: false, reason: 'silent throughout' } : { ok: true },
  );
}

/**
 * Returns proxy options with placeholder profile paths and an inspector that needs no ffmpeg, for tests that do not
 * inspect the forwarded request.
 */
function buildOptions(referenceTranscript: string, upstreamUrl: string): SpeechProxyOptions {
  return {
    inspectClip: acceptClip,
    modelDir: '/models/model',
    referenceAudio: '/profile/reference.wav',
    referenceTranscript,
    upstreamUrl,
  };
}

/** POSTs a JSON speech request to the proxy. */
async function postSpeech(baseUrl: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/v1/audio/speech`, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}

/**
 * Starts a stub voice-clone server that records each JSON body and sends the given answers in order, repeating the
 * last one. `firstClose` settles when the first response closes, and reports whether the stub had sent its answer.
 */
async function startUpstream(...answers: [StubAnswer, ...StubAnswer[]]) {
  const requests: unknown[] = [];
  const firstClose = Promise.withResolvers<{ answered: boolean }>();
  const server = http.createServer((request, response) => {
    let text = '';
    request.on('data', (chunk: Buffer) => {
      text += chunk.toString('utf8');
    });
    request.on('end', () => {
      const {
        body,
        contentType,
        delayMs = 0,
        status,
      } = answers[Math.min(requests.length, answers.length - 1)] ?? answers[0];
      requests.push(JSON.parse(text));
      const timer = setTimeout(() => {
        response.writeHead(status, { 'content-type': contentType });
        response.end(body);
      }, delayMs);
      response.once('close', () => {
        clearTimeout(timer);
        firstClose.resolve({ answered: response.writableFinished });
      });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('the stub upstream has no TCP port');
  const { port } = address;
  async function stop(): Promise<void> {
    if (!server.listening) return;
    const closed = new Promise<void>((resolve) => server.close(() => resolve()));
    server.closeAllConnections();
    await closed;
  }

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    firstClose: firstClose.promise,
    requests,
    stop,
    [Symbol.asyncDispose]: stop,
  };
}

// endregion | Helpers
