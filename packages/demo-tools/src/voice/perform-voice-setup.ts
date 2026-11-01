import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';

import type { VoiceConfig } from '../config/read-machine-config.ts';
import { findFreePort } from '../portable/find-free-port.ts';
import { postJson } from '../portable/post-json.ts';
import { buildVoiceProfile, readProfileSources, resolveVoiceProfilePaths } from './build-voice-profile.ts';
import type { RunInvocation } from './invocation.ts';
import { buildServerLaunch, SERVER_HOST } from './mlx-audio/build-server-launch.ts';
import { buildSpeechRequest, SPEECH_CONTENT_TYPE, SPEECH_PATH } from './mlx-audio/build-speech-request.ts';
import { formatModelDir } from './mlx-audio/format-model-dir.ts';
import { formatVenvPython, MLX_AUDIO_VERSION, planInstall, planModelDownload } from './mlx-audio/plan-install.ts';
import { startVoiceServer } from './voice-server.ts';
import {
  planSetupSteps,
  readVoiceSetupState,
  type VoiceSetupState,
  writeVoiceSetupState,
} from './voice-setup-state.ts';

/** A validated request to set up the voice clone, which the entry point performs. */
export interface VoiceSetupRequest {
  readonly voice: VoiceConfig;
}

/** What setup reports through and runs programs with. */
export interface VoiceSetupEffects {
  readonly report: (line: string) => void;
  readonly run: RunInvocation;
}

/** The outcome of setup: the verification recording, or what stopped setup. */
export type VoiceSetupOutcome = { ok: true; verifyPath: string } | { ok: false; message: string };

/** The phrase that verification synthesizes. */
export const VERIFY_PHRASE = 'This is a test of the cloned voice.';

/** How long verification waits for speech, which includes loading the model on the first request. */
const VERIFY_TIMEOUT_MS = 10 * 60 * 1_000;

/**
 * Installs mlx-audio, downloads the model, and builds the voice profile, skipping each step whose inputs the state
 * file shows unchanged, then verifies the install by synthesizing a phrase through a loopback-only, offline server.
 */
export async function performVoiceSetup(
  { voice }: VoiceSetupRequest,
  { report, run }: VoiceSetupEffects,
): Promise<VoiceSetupOutcome> {
  const { home, model } = voice;
  const statePath = path.join(home, 'state.json');
  const modelDir = formatModelDir(home, model);
  const profilePaths = resolveVoiceProfilePaths(home);

  let state = readVoiceSetupState(statePath);
  function save(next: VoiceSetupState): VoiceSetupState {
    writeVoiceSetupState(statePath, next);
    return next;
  }

  const steps = planSetupSteps(state, {
    hasModelDir: existsSync(modelDir),
    hasProfile: existsSync(profilePaths.record),
    hasVenv: existsSync(formatVenvPython(home)),
    mlxAudio: MLX_AUDIO_VERSION,
    model,
    profileSources: readProfileSources(voice),
  });

  if (steps.install) {
    report(`installing mlx-audio ${MLX_AUDIO_VERSION} into ${path.join(home, 'venv')}`);
    for (const invocation of planInstall(home)) {
      const outcome = await run(invocation);
      if (!outcome.ok) return outcome;
    }
    state = save({ ...state, mlxAudio: MLX_AUDIO_VERSION });
  } else {
    report(`mlx-audio ${MLX_AUDIO_VERSION} is installed; skipping`);
  }

  if (steps.download) {
    report(`downloading ${model} into ${modelDir}`);
    for (const invocation of planModelDownload(home, model)) {
      const outcome = await run(invocation);
      if (!outcome.ok) return outcome;
    }
    // Drop the profile with the old model, so that an interrupted run rebuilds it.
    const { mlxAudio } = state;
    state = save({ schemaVersion: 1, ...(mlxAudio !== undefined && { mlxAudio }), model });
  } else {
    report(`${model} is downloaded; skipping`);
  }

  if (steps.profile) {
    report(`building the voice profile in ${profilePaths.dir}`);
    const built = await buildVoiceProfile(voice, run);
    if (!built.ok) return built;
    const { referenceSha256, transcriptSha256 } = built.record;
    save({ ...state, profile: { referenceSha256, transcriptSha256 } });
  } else {
    report('the voice profile is current; skipping');
  }

  return verifyClone(voice, report);
}

// region | Helpers

/** Starts the server, synthesizes `VERIFY_PHRASE` in the cloned voice, writes it to `verify.mp3`, and stops the server. */
async function verifyClone({ home, model }: VoiceConfig, report: (line: string) => void): Promise<VoiceSetupOutcome> {
  const launch = buildServerLaunch(home, await findFreePort(SERVER_HOST));
  report(`verifying: starting the voice-clone server on ${launch.baseUrl}`);
  const started = await startVoiceServer(launch);
  if (!started.ok) return started;
  await using server = started.server;

  const profilePaths = resolveVoiceProfilePaths(home);
  const body = buildSpeechRequest({
    input: VERIFY_PHRASE,
    modelDir: formatModelDir(home, model),
    referenceAudio: profilePaths.referenceAudio,
    referenceText: readFileSync(profilePaths.transcript, 'utf8').trim(),
  });
  report(`verifying: synthesizing "${VERIFY_PHRASE}"; the first request loads the model`);

  let response;
  try {
    response = await postJson(`${server.baseUrl}${SPEECH_PATH}`, body, VERIFY_TIMEOUT_MS);
  } catch (error) {
    return { ok: false, message: `the speech request failed (${describeError(error)}); see ${launch.logPath}` };
  }

  if (response.status !== 200) {
    const detail = response.body.toString('utf8').slice(0, 500);
    return {
      ok: false,
      message: `the voice-clone server answered ${response.status} (${detail}); see ${launch.logPath}`,
    };
  }
  if (response.contentType?.startsWith(SPEECH_CONTENT_TYPE) !== true || response.body.length === 0) {
    return {
      ok: false,
      message: `the voice-clone server answered without ${SPEECH_CONTENT_TYPE} audio; see ${launch.logPath}`,
    };
  }

  const verifyPath = path.join(home, 'verify.mp3');
  writeFileSync(verifyPath, response.body);
  return { ok: true, verifyPath };
}

// endregion | Helpers
