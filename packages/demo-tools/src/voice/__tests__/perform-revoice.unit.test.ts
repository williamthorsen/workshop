import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { type AidemoStage, performRevoice, type RevoiceEffects, type RevoiceOutcome } from '../perform-revoice.ts';
import type { FirstSpeechOutcome, FirstSpeechRequest } from '../request-first-speech.ts';
import type { RevoiceRequest } from '../revoice-request.ts';
import type { ServerProcess, StartVoiceServerResult } from '../voice-server.ts';

const STAGES = [
  ['voice', '/demo', '--force'],
  ['captions', '/demo', '--offline'],
  ['compose', '/demo'],
] as const;

describe(performRevoice, () => {
  it('runs the stages in order with the proxy URL in the environment, then stops the server and the proxy', async () => {
    using home = createVoiceHome();
    const harness = createHarness({ exitCodes: [0, 0, 0] });

    const outcome = await performRevoice(buildRequest(home), harness.effects);

    expect(outcome).toStrictEqual({ ok: true });
    expect(harness.stages.map(({ args }) => args)).toStrictEqual(STAGES);
    for (const stage of harness.stages) {
      expect(stage).toMatchObject({ bin: '/repo/aidemo.mjs', cwd: '/repo', env: { PATH: '/bin' } });
      expect(stage.env['AIDEMO_OPENAI_BASE_URL']).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/v1$/);
    }
    expect(harness.launches).toHaveLength(1);
    expect(harness.stopCount()).toBe(1);
    await expect(isProxyAnswering(harness)).resolves.toBe(false);
  });

  it('loads the model with a first speech request to the server before the first stage', async () => {
    using home = createVoiceHome();
    const harness = createHarness({ exitCodes: [0, 0, 0] });

    await performRevoice(buildRequest(home), harness.effects);

    expect(harness.firstSpeeches).toHaveLength(1);
    expect(harness.firstSpeeches[0]).toMatchObject({
      baseUrl: harness.launches[0]?.baseUrl,
      body: { model: home.resolve('models/org--model'), ref_text: 'Hello there.' },
      model: 'org/model',
      modelDir: home.resolve('models/org--model'),
    });
    expect(harness.events.indexOf('first speech')).toBeLessThan(harness.events.indexOf('stage'));
  });

  it('stops without running a stage when the model does not load, and stops the server', async () => {
    using home = createVoiceHome();
    const harness = createHarness({ exitCodes: [], firstSpeech: { ok: false, message: 'did not load within 99 s' } });

    const outcome = await performRevoice(buildRequest(home), harness.effects);

    expect(outcome).toStrictEqual({ ok: false, exitCode: 1, message: 'did not load within 99 s' });
    expect(harness.stages).toStrictEqual([]);
    expect(harness.stopCount()).toBe(1);
  });

  it('stops without running a stage when the server does not start', async () => {
    using home = createVoiceHome();
    const harness = createHarness({ exitCodes: [], startResult: { ok: false, message: 'the server exited' } });

    const outcome = await performRevoice(buildRequest(home), harness.effects);

    expect(outcome).toStrictEqual({ ok: false, exitCode: 1, message: 'the server exited' });
    expect(harness.stages).toStrictEqual([]);
  });

  it('stops at a stage that exits non-zero, naming the stage and the log, and stops the server and the proxy', async () => {
    using home = createVoiceHome();
    const harness = createHarness({ exitCodes: [0, 4] });

    const outcome = await performRevoice(buildRequest(home), harness.effects);

    expect(outcome).toStrictEqual({
      ok: false,
      exitCode: 4,
      message: `aidemo captions exited with code 4; the voice-clone server's log is ${home.resolve('logs/server.log')}`,
    });
    expect(harness.stages.map(({ args }) => args[0])).toStrictEqual(['voice', 'captions']);
    expect(harness.stopCount()).toBe(1);
    await expect(isProxyAnswering(harness)).resolves.toBe(false);
  });

  it('names the text that the proxy refused when a stage fails after a refusal', async () => {
    using home = createVoiceHome();
    const harness = createHarness({ exitCodes: [1], speak: 'Scene one.' });

    const outcome = await performRevoice(buildRequest(home), harness.effects);

    expect(outcome).toMatchObject({ ok: false, exitCode: 1 });
    expect(readMessage(outcome)).toMatch(
      /^the voice clone could not speak "Scene one\." \(the voice-clone server failed: .+\); the voice-clone server's log is /,
    );
    expect(readMessage(outcome)).toContain(home.resolve('logs/server.log'));
    expect(harness.stopCount()).toBe(1);
  });

  it('stops the server and the proxy when a stage throws', async () => {
    using home = createVoiceHome();
    const harness = createHarness({ exitCodes: [new Error('spawn failed')] });

    await expect(performRevoice(buildRequest(home), harness.effects)).rejects.toThrow('spawn failed');

    expect(harness.stopCount()).toBe(1);
    await expect(isProxyAnswering(harness)).resolves.toBe(false);
  });
});

// region | Helpers

/** Fake effects for a revoice, with what they were called with. */
interface Harness {
  readonly effects: RevoiceEffects;
  /** The order in which the effects ran, as `first speech` and `stage`. */
  readonly events: string[];
  readonly firstSpeeches: FirstSpeechRequest[];
  readonly launches: ServerProcess[];
  readonly stages: AidemoStage[];
  readonly stopCount: () => number;
}

/**
 * What the fake effects answer: each stage's exit code or error, the first speech request, the server's start, and a
 * text to speak first.
 */
interface HarnessOptions {
  readonly exitCodes: readonly (Error | number)[];
  readonly firstSpeech?: FirstSpeechOutcome;
  /** Text that the first stage asks the proxy to speak before it exits. */
  readonly speak?: string;
  readonly startResult?: StartVoiceServerResult;
}

/** Returns the request of a revoice of the three stages, with the voice installed under `home`. */
function buildRequest(home: TempTree): RevoiceRequest {
  return {
    bin: '/repo/aidemo.mjs',
    cwd: '/repo',
    env: { PATH: '/bin' },
    stages: STAGES,
    take: { kind: 'notice', message: 'not archived' },
    voice: {
      home: home.dir,
      model: 'org/model',
      referenceAudio: '/ref.m4a',
      referenceTranscript: '/ref.txt',
      sampling: {},
    },
  };
}

/**
 * Creates fake effects. The fake server answers at the launch's own URL, on which nothing listens, so that the proxy
 * refuses every speech request without measuring a clip.
 */
function createHarness({ exitCodes, firstSpeech, speak, startResult }: HarnessOptions): Harness {
  const events: string[] = [];
  const firstSpeeches: FirstSpeechRequest[] = [];
  const launches: ServerProcess[] = [];
  const stages: AidemoStage[] = [];
  let stops = 0;
  function stop(): Promise<void> {
    stops += 1;
    return Promise.resolve();
  }

  return {
    effects: {
      report: () => {},
      requestFirstSpeech: (request) => {
        events.push('first speech');
        firstSpeeches.push(request);
        return Promise.resolve(firstSpeech ?? { ok: true, audio: Buffer.from('ID3') });
      },
      runStage: async (stage) => {
        events.push('stage');
        stages.push(stage);
        if (speak !== undefined && stages.length === 1) await postSpeech(stage, speak);
        const exitCode = exitCodes[stages.length - 1];
        if (exitCode === undefined) throw new Error(`no exit code scripted for stage ${stages.length}`);
        if (exitCode instanceof Error) throw exitCode;
        return exitCode;
      },
      startServer: (launch) => {
        launches.push(launch);
        return Promise.resolve(
          startResult ?? { ok: true, server: { baseUrl: launch.baseUrl, stop, [Symbol.asyncDispose]: stop } },
        );
      },
    },
    events,
    firstSpeeches,
    launches,
    stages,
    stopCount: () => stops,
  };
}

/** Creates a voice home containing the profile files that the speech proxy reads. */
function createVoiceHome(): TempTree {
  return createTempTree({ 'profile/reference.wav': 'RIFF', 'profile/transcript.txt': 'Hello there.\n' });
}

/** Reports whether the proxy of the first stage still accepts connections. */
async function isProxyAnswering({ stages }: Harness): Promise<boolean> {
  const baseUrl = stages[0]?.env['AIDEMO_OPENAI_BASE_URL'];
  if (baseUrl === undefined) throw new Error('no stage ran');
  try {
    const response = await fetch(baseUrl, { signal: AbortSignal.timeout(1000) });
    await response.body?.cancel();
    return true;
  } catch {
    return false;
  }
}

/** Sends an OpenAI-shaped speech request for `input` to the proxy named in the stage's environment. */
async function postSpeech({ env }: AidemoStage, input: string): Promise<void> {
  const response = await fetch(`${env['AIDEMO_OPENAI_BASE_URL'] ?? ''}/audio/speech`, {
    body: JSON.stringify({ input, model: 'org/model', response_format: 'mp3', voice: 'marin' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  await response.body?.cancel();
}

/** Returns the message of a failed outcome. */
function readMessage(outcome: RevoiceOutcome): string {
  if (outcome.ok) throw new Error('expected the revoice to fail');
  return outcome.message;
}

// endregion | Helpers
