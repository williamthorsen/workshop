import http from 'node:http';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { startSpeechProxy } from '../speech-proxy.ts';

const OPENAI_REQUEST = {
  model: 'mlx-community/model',
  voice: 'marin',
  input: 'Hello from the demo.',
  instructions: 'Speak slowly.',
  response_format: 'mp3',
};

describe(startSpeechProxy, () => {
  it('forwards the text with the voice profile, and without voice or instructions', async () => {
    await using upstream = await startUpstream(200, 'audio/mp3', 'MP3');
    using tree = createTempTree({ 'reference.wav': 'RIFF', 'transcript.txt': '  The reference text.\n' });
    await using proxy = await startSpeechProxy({
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
    await using upstream = await startUpstream(200, 'audio/mp3', 'MP3');
    using tree = createTempTree({ 'transcript.txt': 'text' });
    await using proxy = await startSpeechProxy(buildOptions(tree.resolve('transcript.txt'), upstream.baseUrl));

    expect(new URL(proxy.baseUrl).hostname).toBe('127.0.0.1');
  });

  it('relays an upstream failure status and body unchanged', async () => {
    await using upstream = await startUpstream(422, 'application/json', '{"detail":"bad"}');
    using tree = createTempTree({ 'transcript.txt': 'text' });
    await using proxy = await startSpeechProxy(buildOptions(tree.resolve('transcript.txt'), upstream.baseUrl));

    const response = await postSpeech(proxy.baseUrl, OPENAI_REQUEST);

    expect(response.status).toBe(422);
    await expect(response.text()).resolves.toBe('{"detail":"bad"}');
  });

  it('answers 502 when the upstream cannot be reached', async () => {
    const upstream = await startUpstream(200, 'audio/mp3', 'MP3');
    const { baseUrl } = upstream;
    await upstream.stop();
    using tree = createTempTree({ 'transcript.txt': 'text' });
    await using proxy = await startSpeechProxy(buildOptions(tree.resolve('transcript.txt'), baseUrl));

    const response = await postSpeech(proxy.baseUrl, OPENAI_REQUEST);

    expect(response.status).toBe(502);
  });

  it('answers 400 to a body without a string input, and 404 to any other request', async () => {
    await using upstream = await startUpstream(200, 'audio/mp3', 'MP3');
    using tree = createTempTree({ 'transcript.txt': 'text' });
    await using proxy = await startSpeechProxy(buildOptions(tree.resolve('transcript.txt'), upstream.baseUrl));

    expect((await postSpeech(proxy.baseUrl, { voice: 'marin' })).status).toBe(400);
    expect((await fetch(`${proxy.baseUrl}/v1/audio/speech`)).status).toBe(404);
    expect((await fetch(`${proxy.baseUrl}/v1/audio/transcriptions`, { method: 'POST' })).status).toBe(404);
    expect(upstream.requests).toStrictEqual([]);
  });

  it('answers 403 to a request that a web page sent, without forwarding it', async () => {
    await using upstream = await startUpstream(200, 'audio/mp3', 'MP3');
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

/** Returns proxy options with placeholder profile paths, for tests that do not inspect the forwarded request. */
function buildOptions(referenceTranscript: string, upstreamUrl: string) {
  return { modelDir: '/models/model', referenceAudio: '/profile/reference.wav', referenceTranscript, upstreamUrl };
}

/** POSTs a JSON speech request to the proxy. */
async function postSpeech(baseUrl: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/v1/audio/speech`, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}

/** Starts a stub voice-clone server that records each JSON body and answers with a fixed response. */
async function startUpstream(status: number, contentType: string, body: string) {
  const requests: unknown[] = [];
  const server = http.createServer((request, response) => {
    let text = '';
    request.on('data', (chunk: Buffer) => {
      text += chunk.toString('utf8');
    });
    request.on('end', () => {
      requests.push(JSON.parse(text));
      response.writeHead(status, { 'content-type': contentType });
      response.end(body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('the stub upstream has no TCP port');
  const { port } = address;
  async function stop(): Promise<void> {
    if (!server.listening) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  return { baseUrl: `http://127.0.0.1:${port}`, requests, stop, [Symbol.asyncDispose]: stop };
}

// endregion | Helpers
