import { readFileSync } from 'node:fs';

import { findFreePort } from '../portable/find-free-port.ts';
import { resolveVoiceProfilePaths } from './build-voice-profile.ts';
import { buildServerLaunch, SERVER_HOST } from './mlx-audio/build-server-launch.ts';
import { buildSpeechRequest } from './mlx-audio/build-speech-request.ts';
import { formatModelDir } from './mlx-audio/format-model-dir.ts';
import { VERIFY_PHRASE } from './perform-voice-setup.ts';
import type { requestFirstSpeech } from './request-first-speech.ts';
import type { RevoiceRequest } from './revoice-request.ts';
import { REQUEST_BUDGET_MS, type SpeechFailure, startSpeechProxy } from './speech-proxy.ts';
import type { ServerProcess, StartVoiceServerResult } from './voice-server.ts';

/** An aidemo stage to run: its arguments, the bin, and where and with what environment to run it. */
export interface AidemoStage {
  readonly args: readonly string[];
  readonly bin: string;
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
}

/** What a revoice reports through, runs aidemo with, starts the voice-clone server with, and loads the model with. */
export interface RevoiceEffects {
  readonly report: (line: string) => void;
  /** Sends the first speech request, which loads the model. */
  readonly requestFirstSpeech: typeof requestFirstSpeech;
  /** Runs an aidemo stage to completion, resolving to its exit code. */
  readonly runStage: (stage: AidemoStage) => Promise<number>;
  /** Starts the voice-clone server, resolving once it answers or with why it never did. */
  readonly startServer: (launch: ServerProcess) => Promise<StartVoiceServerResult>;
}

/** The outcome of a revoice: success, or the exit code and what stopped it. */
export type RevoiceOutcome = { ok: true } | { ok: false; exitCode: number; message: string };

/**
 * Starts the voice-clone server, loads the model with a first speech request, starts the speech proxy in front of the
 * server, runs the aidemo stages in order with aidemo's speech requests sent to the proxy, and stops both, whether the
 * stages succeed, fail, or throw.
 */
export async function performRevoice(request: RevoiceRequest, effects: RevoiceEffects): Promise<RevoiceOutcome> {
  const { report, runStage, startServer } = effects;
  const { home, model, sampling } = request.voice;
  const launch = buildServerLaunch(home, await findFreePort(SERVER_HOST));
  report(`starting the voice-clone server on ${launch.baseUrl}`);
  const started = await startServer(launch);
  if (!started.ok) return { ok: false, exitCode: 1, message: started.message };
  await using server = started.server;

  const modelDir = formatModelDir(home, model);
  const profile = resolveVoiceProfilePaths(home);
  const warmUp = await effects.requestFirstSpeech(
    {
      baseUrl: server.baseUrl,
      body: buildSpeechRequest({
        input: VERIFY_PHRASE,
        modelDir,
        referenceAudio: profile.referenceAudio,
        referenceText: readFileSync(profile.transcript, 'utf8').trim(),
        sampling,
      }),
      logPath: launch.logPath,
      model,
      modelDir,
    },
    { report, synthesisLimitMs: REQUEST_BUDGET_MS },
  );
  if (!warmUp.ok) return { ok: false, exitCode: 1, message: warmUp.message };

  await using proxy = await startSpeechProxy({
    extraGapMs: request.extraGapMs,
    modelDir,
    referenceAudio: profile.referenceAudio,
    referenceTranscript: profile.transcript,
    sampling,
    upstreamUrl: server.baseUrl,
  });
  const env = { ...request.env, AIDEMO_OPENAI_BASE_URL: `${proxy.baseUrl}/v1` };

  for (const args of request.stages) {
    report(`running aidemo ${args.join(' ')}`);
    const exitCode = await runStage({ args, bin: request.bin, cwd: request.cwd, env });
    if (exitCode !== 0) {
      const cause = describeStageFailure(proxy.readFailure(), args[0] ?? '', exitCode);
      return { ok: false, exitCode, message: `${cause}; the voice-clone server's log is ${launch.logPath}` };
    }
  }

  return { ok: true };
}

// region | Helpers

/** Describes why an aidemo stage failed, blaming the speech proxy's failure when it recorded one. */
function describeStageFailure(failure: SpeechFailure | undefined, stage: string, exitCode: number): string {
  if (failure === undefined) return `aidemo ${stage} exited with code ${exitCode}`;
  if (failure.input === undefined) return failure.reason;
  return `the voice clone could not speak "${failure.input}" (${failure.reason})`;
}

// endregion | Helpers
