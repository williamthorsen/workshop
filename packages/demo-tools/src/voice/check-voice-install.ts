import { existsSync, readFileSync } from 'node:fs';

import type { VoiceConfig } from '../config/read-machine-config.ts';
import { isRecord } from '../portable/is-record.ts';
import { readProfileSources, resolveVoiceProfilePaths } from './build-voice-profile.ts';
import { formatModelDir } from './mlx-audio/format-model-dir.ts';
import { formatVenvPython } from './mlx-audio/plan-install.ts';

/** The outcome of checking the install: the reference recording's checksum, or what does not match. */
export type VoiceInstallCheck = { ok: true; referenceSha256: string } | { ok: false; problem: string };

/**
 * Checks that `voice setup` installed mlx-audio and the configured model under `voice.home` and built the profile
 * from the configured model, reference recording, and transcript.
 */
export function checkVoiceInstall(voice: VoiceConfig): VoiceInstallCheck {
  function fail(problem: string): VoiceInstallCheck {
    return { ok: false, problem: `${problem}; run thor-demo voice setup` };
  }

  if (!existsSync(formatVenvPython(voice.home))) return fail(`mlx-audio is not installed in ${voice.home}`);
  if (!existsSync(formatModelDir(voice.home, voice.model))) return fail(`${voice.model} is not downloaded`);

  const recordPath = resolveVoiceProfilePaths(voice.home).record;
  const record = readProfileRecord(recordPath);
  if (record === undefined) return fail(`the voice profile is missing or unreadable (${recordPath})`);
  if (record.model !== voice.model) {
    return fail(`the voice profile was built for ${record.model}, but voice.model is ${voice.model}`);
  }

  const sources = readProfileSources(voice);
  if (record.referenceSha256 !== sources.referenceSha256) {
    return fail('the voice profile was built from another recording than voice.reference.audio');
  }
  if (record.transcriptSha256 !== sources.transcriptSha256) {
    return fail('the voice profile was built from another transcript than voice.reference.transcript');
  }

  return { ok: true, referenceSha256: sources.referenceSha256 };
}

// region | Helpers

/** Reads the fields of `profile.json` that the check compares, or `undefined` when the file is absent or malformed. */
function readProfileRecord(
  recordPath: string,
): { model: string; referenceSha256: string; transcriptSha256: string } | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(recordPath, 'utf8'));
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;

  const { model, referenceSha256, transcriptSha256 } = parsed;
  if (typeof model !== 'string' || typeof referenceSha256 !== 'string' || typeof transcriptSha256 !== 'string') {
    return undefined;
  }
  return { model, referenceSha256, transcriptSha256 };
}

// endregion | Helpers
