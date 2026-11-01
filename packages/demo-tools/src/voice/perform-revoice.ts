import { findFreePort } from '../portable/find-free-port.ts';
import { resolveVoiceProfilePaths } from './build-voice-profile.ts';
import { buildServerLaunch, SERVER_HOST } from './mlx-audio/build-server-launch.ts';
import { formatModelDir } from './mlx-audio/format-model-dir.ts';
import type { RevoiceRequest } from './revoice-request.ts';
import { startSpeechProxy } from './speech-proxy.ts';
import { startVoiceServer } from './voice-server.ts';

/** An aidemo stage to run: its arguments, the bin, and where and with what environment to run it. */
export interface AidemoStage {
  readonly args: readonly string[];
  readonly bin: string;
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
}

/** What a revoice reports through and runs aidemo with. */
export interface RevoiceEffects {
  readonly report: (line: string) => void;
  /** Runs an aidemo stage to completion, resolving to its exit code. */
  readonly runStage: (stage: AidemoStage) => Promise<number>;
}

/** The outcome of a revoice: success, or the exit code and what stopped it. */
export type RevoiceOutcome = { ok: true } | { ok: false; exitCode: number; message: string };

/**
 * Starts the voice-clone server and the speech proxy in front of it, runs the aidemo stages in order with aidemo's
 * speech requests sent to the proxy, and stops both, whether the stages succeed, fail, or throw.
 */
export async function performRevoice(
  request: RevoiceRequest,
  { report, runStage }: RevoiceEffects,
): Promise<RevoiceOutcome> {
  const { home, model } = request.voice;
  const launch = buildServerLaunch(home, await findFreePort(SERVER_HOST));
  report(`starting the voice-clone server on ${launch.baseUrl}`);
  const started = await startVoiceServer(launch);
  if (!started.ok) return { ok: false, exitCode: 1, message: started.message };
  await using server = started.server;

  const profile = resolveVoiceProfilePaths(home);
  await using proxy = await startSpeechProxy({
    modelDir: formatModelDir(home, model),
    referenceAudio: profile.referenceAudio,
    referenceTranscript: profile.transcript,
    upstreamUrl: server.baseUrl,
  });
  const env = { ...request.env, AIDEMO_OPENAI_BASE_URL: `${proxy.baseUrl}/v1` };

  for (const args of request.stages) {
    report(`running aidemo ${args.join(' ')}`);
    const exitCode = await runStage({ args, bin: request.bin, cwd: request.cwd, env });
    if (exitCode !== 0) {
      return {
        ok: false,
        exitCode,
        message: `aidemo ${args[0] ?? ''} exited with code ${exitCode}; the voice-clone server's log is ${launch.logPath}`,
      };
    }
  }

  return { ok: true };
}
