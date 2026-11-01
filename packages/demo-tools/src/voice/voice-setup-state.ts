import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { isRecord } from '../portable/is-record.ts';
import type { ProfileSources } from './build-voice-profile.ts';

/** What `voice setup` has completed, each field written once its step succeeds. */
export interface VoiceSetupState {
  /** The installed mlx-audio version. */
  readonly mlxAudio?: string;
  /** The downloaded model. */
  readonly model?: string;
  /** The sources from which the profile was built. */
  readonly profile?: ProfileSources;
  readonly schemaVersion: 1;
}

/** What the setup steps depend on now. */
export interface SetupInputs {
  readonly hasModelDir: boolean;
  readonly hasProfile: boolean;
  readonly hasVenv: boolean;
  readonly mlxAudio: string;
  readonly model: string;
  readonly profileSources: ProfileSources;
}

/** Which steps to run; verification always runs. */
export interface SetupSteps {
  readonly download: boolean;
  readonly install: boolean;
  readonly profile: boolean;
}

/**
 * Decides which steps to run: each runs when the state does not show its inputs unchanged or its output is
 * missing. A new model also rebuilds the profile, whose record names the model.
 */
export function planSetupSteps(state: VoiceSetupState, inputs: SetupInputs): SetupSteps {
  const install = !inputs.hasVenv || state.mlxAudio !== inputs.mlxAudio;
  const download = !inputs.hasModelDir || state.model !== inputs.model;
  const profile =
    download ||
    !inputs.hasProfile ||
    state.profile?.referenceSha256 !== inputs.profileSources.referenceSha256 ||
    state.profile.transcriptSha256 !== inputs.profileSources.transcriptSha256;

  return { download, install, profile };
}

/** Reads the state file, treating a missing, unparseable, or unrecognized one as a state that shows nothing done. */
export function readVoiceSetupState(statePath: string): VoiceSetupState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(statePath, 'utf8'));
  } catch {
    return { schemaVersion: 1 };
  }
  if (!isRecord(parsed) || parsed['schemaVersion'] !== 1) return { schemaVersion: 1 };

  const { mlxAudio, model, profile } = parsed;
  return {
    schemaVersion: 1,
    ...(typeof mlxAudio === 'string' && { mlxAudio }),
    ...(typeof model === 'string' && { model }),
    ...(isProfileSources(profile) && {
      profile: { referenceSha256: profile.referenceSha256, transcriptSha256: profile.transcriptSha256 },
    }),
  };
}

/** Writes the state file. */
export function writeVoiceSetupState(statePath: string, state: VoiceSetupState): void {
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

// region | Helpers

/** Reports whether a parsed value has the two checksums of a profile's sources. */
function isProfileSources(value: unknown): value is ProfileSources {
  return (
    isRecord(value) && typeof value['referenceSha256'] === 'string' && typeof value['transcriptSha256'] === 'string'
  );
}

// endregion | Helpers
