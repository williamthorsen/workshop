import http from 'node:http';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, describe, expect, it } from 'vitest';

import { buildSpeechRequest } from '../mlx-audio/build-speech-request.ts';
import { computeLoadLimitMs, type FirstSpeechOutcome, requestFirstSpeech } from '../request-first-speech.ts';

const servers: http.Server[] = [];

describe(requestFirstSpeech, () => {
  afterEach(async () => {
    for (const server of servers.splice(0)) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('returns the audio, reporting the load and its duration', async () => {
    using modelDir = createTempTree({ 'model.safetensors': 'weights' });
    const baseUrl = await startServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'audio/mp3' });
      response.end('ID3audio');
    });
    const lines: string[] = [];

    const outcome = await speak(baseUrl, modelDir, {
      report: (line) => {
        lines.push(line);
      },
    });

    expect(outcome).toStrictEqual({ ok: true, audio: Buffer.from('ID3audio') });
    expect(lines).toStrictEqual(['loading org/model', 'loaded org/model in 0 s; synthesizing speech']);
  });

  it('fails naming the load limit and the model size when the headers never arrive', async () => {
    using modelDir = createTempTree({ 'model.safetensors': 'weights' });
    const baseUrl = await startServer(() => {});

    const outcome = await speak(baseUrl, modelDir, { loadLimitMs: 50 });

    expect(outcome).toStrictEqual({
      ok: false,
      message:
        'the voice-clone server did not load org/model within 0 s, the limit for its 0.0 GB; see /logs/server.log',
    });
  });

  it('fails naming the synthesis limit when the body never ends after the headers', async () => {
    using modelDir = createTempTree({ 'model.safetensors': 'weights' });
    const baseUrl = await startServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'audio/mp3' });
      response.write('ID3');
    });

    const outcome = await speak(baseUrl, modelDir, { synthesisLimitMs: 50 });

    expect(outcome).toStrictEqual({
      ok: false,
      message: 'the voice-clone server did not synthesize speech within 0 s; see /logs/server.log',
    });
  });

  it("fails with the server's status and the start of its answer when it does not answer 200", async () => {
    using modelDir = createTempTree({ 'model.safetensors': 'weights' });
    const baseUrl = await startServer((_request, response) => {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end('{"detail":"boom"}');
    });

    const outcome = await speak(baseUrl, modelDir);

    expect(outcome).toStrictEqual({
      ok: false,
      message: 'the voice-clone server answered 500 ({"detail":"boom"}); see /logs/server.log',
    });
  });

  it('fails when the answer is not audio', async () => {
    using modelDir = createTempTree({ 'model.safetensors': 'weights' });
    const baseUrl = await startServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'audio/mp3' });
      response.end();
    });

    const outcome = await speak(baseUrl, modelDir);

    expect(outcome).toStrictEqual({
      ok: false,
      message: 'the voice-clone server answered without audio/mp3 audio; see /logs/server.log',
    });
  });

  it('fails naming the directory when the model directory cannot be measured', async () => {
    using home = createTempTree({});

    const outcome = await requestFirstSpeech(
      { ...buildRequest('http://127.0.0.1:9'), modelDir: home.resolve('absent') },
      { report: () => {}, synthesisLimitMs: 1000 },
    );

    expect(outcome).toMatchObject({ ok: false });
    expect(outcome.ok ? '' : outcome.message).toMatch(/^cannot measure the size of .+absent \(.*ENOENT/);
  });
});

describe(computeLoadLimitMs, () => {
  it('grows with the size of the model', () => {
    expect(computeLoadLimitMs(68e9)).toBeGreaterThan(computeLoadLimitMs(6e9));
  });

  it('allows a base time to a model of any size', () => {
    expect(computeLoadLimitMs(0)).toBeGreaterThan(0);
  });
});

// region | Helpers

/** Returns a first speech request to `baseUrl` for the model `org/model`. */
function buildRequest(baseUrl: string): Parameters<typeof requestFirstSpeech>[0] {
  return {
    baseUrl,
    body: buildSpeechRequest({
      input: 'Hello.',
      modelDir: '/models/org--model',
      referenceAudio: '/ref.wav',
      referenceText: 'Hi.',
      sampling: {},
    }),
    logPath: '/logs/server.log',
    model: 'org/model',
    modelDir: '/models/org--model',
  };
}

/** Sends a first speech request for the model in `modelDir` to `baseUrl`. */
async function speak(
  baseUrl: string,
  modelDir: TempTree,
  options: Partial<Parameters<typeof requestFirstSpeech>[1]> = {},
): Promise<FirstSpeechOutcome> {
  return requestFirstSpeech(
    { ...buildRequest(baseUrl), modelDir: modelDir.dir },
    { report: () => {}, synthesisLimitMs: 5000, ...options },
  );
}

/** Starts a loopback server that answers with `handler`, resolving to its base URL. */
async function startServer(handler: http.RequestListener): Promise<string> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('cannot read the port');
  return `http://127.0.0.1:${address.port}`;
}

// endregion | Helpers
