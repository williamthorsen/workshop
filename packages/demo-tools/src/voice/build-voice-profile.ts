import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { VoiceConfig } from '../config/read-machine-config.ts';
import type { Invocation, RunInvocation } from './invocation.ts';

/** The checksums of the configured reference, which decide whether a profile still matches the configuration. */
export interface ProfileSources {
  /** The checksum of the configured recording, not of the converted WAV, so that comparing it needs no ffmpeg. */
  readonly referenceSha256: string;
  readonly transcriptSha256: string;
}

/** The record of what a profile was built from, written as `profile.json`. */
export interface ProfileRecord extends ProfileSources {
  readonly model: string;
  readonly schemaVersion: 1;
}

/** The files of a built profile. */
export interface VoiceProfilePaths {
  readonly dir: string;
  readonly record: string;
  readonly referenceAudio: string;
  readonly transcript: string;
}

/** The outcome of building a profile: its record, or what stopped it. */
export type BuildVoiceProfileResult = { ok: true; record: ProfileRecord } | { ok: false; message: string };

/**
 * Builds the voice profile under the install location: the reference converted to mono WAV at its own sample rate,
 * the trimmed transcript, and `profile.json`. It builds in a temporary directory and renames it into place, so that
 * an interrupted build never leaves a partial profile.
 */
export async function buildVoiceProfile(voice: VoiceConfig, run: RunInvocation): Promise<BuildVoiceProfileResult> {
  const transcript = readFileSync(voice.referenceTranscript, 'utf8').trim();
  if (transcript === '') {
    return {
      ok: false,
      message: `voice.reference.transcript (${voice.referenceTranscript}) is empty; write in it exactly what the recording says`,
    };
  }

  const paths = resolveVoiceProfilePaths(voice.home);
  mkdirSync(voice.home, { recursive: true });
  const buildDir = mkdtempSync(path.join(voice.home, '.profile-'));
  try {
    const converted = await run(planReferenceConversion(voice.referenceAudio, path.join(buildDir, 'reference.wav')));
    if (!converted.ok) return { ok: false, message: `cannot convert the reference recording: ${converted.message}` };

    const record: ProfileRecord = { schemaVersion: 1, model: voice.model, ...readProfileSources(voice) };
    writeFileSync(path.join(buildDir, 'transcript.txt'), `${transcript}\n`);
    writeFileSync(path.join(buildDir, 'profile.json'), `${JSON.stringify(record, null, 2)}\n`);

    rmSync(paths.dir, { force: true, recursive: true });
    renameSync(buildDir, paths.dir);
    return { ok: true, record };
  } finally {
    rmSync(buildDir, { force: true, recursive: true });
  }
}

/** Returns the ffmpeg command that converts `source` to mono WAV at `target`, keeping its sample rate. */
export function planReferenceConversion(source: string, target: string): Invocation {
  return { command: 'ffmpeg', args: ['-nostdin', '-loglevel', 'error', '-i', source, '-ac', '1', target], env: {} };
}

/** Returns the checksums of the configured reference recording and transcript. */
export function readProfileSources(voice: VoiceConfig): ProfileSources {
  return {
    referenceSha256: hashFile(voice.referenceAudio),
    transcriptSha256: hashFile(voice.referenceTranscript),
  };
}

/** Returns the paths of the profile's files under the install location. */
export function resolveVoiceProfilePaths(home: string): VoiceProfilePaths {
  const dir = path.join(home, 'profile');
  return {
    dir,
    record: path.join(dir, 'profile.json'),
    referenceAudio: path.join(dir, 'reference.wav'),
    transcript: path.join(dir, 'transcript.txt'),
  };
}

// region | Helpers

/** Returns the sha256 of a file's content. */
function hashFile(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

// endregion | Helpers
