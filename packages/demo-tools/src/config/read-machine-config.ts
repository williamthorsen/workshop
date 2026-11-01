import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { parse } from 'yaml';

import { isRecord } from '../portable/is-record.ts';
import { expandValue } from './expand-value.ts';
import { findUnknownKey } from './find-unknown-key.ts';

/**
 * The outcome of reading the machine configuration: a failure of the file as a whole, which stops every command
 * that reads it, or one result per section. A failed `archive` section stops `render`, and a failed `voice` section
 * stops `voice setup`; neither stops the other's command.
 */
export type MachineConfigResult =
  { ok: false; message: string } | { ok: true; archive: ArchiveSectionResult; voice: VoiceSectionResult };

/** The outcome of reading the `archive` section: the root, `undefined` when the section sets none, or what is wrong. */
export type ArchiveSectionResult = { ok: true; root: string | undefined } | { ok: false; message: string };

/** The outcome of reading the `voice` section: the settings, `undefined` when the section is absent, or what is wrong. */
export type VoiceSectionResult = { ok: true; voice: VoiceConfig | undefined } | { ok: false; message: string };

/** The voice-clone settings, with every default applied and every path absolute. */
export interface VoiceConfig {
  /** The install location, which holds the virtual environment, the models, the profile, and the setup state. */
  readonly home: string;
  /** The Hugging Face ID of the model that clones the voice. */
  readonly model: string;
  readonly referenceAudio: string;
  readonly referenceTranscript: string;
}

/** What reading the machine configuration takes from its caller's environment. */
export interface MachineConfigInput {
  readonly env: NodeJS.ProcessEnv;
  readonly homeDir: string;
}

/** The voice-clone install location when the configuration does not set one, relative to the home directory. */
export const DEFAULT_VOICE_HOME = '.local/share/thor-demo/voice';

/** The voice-clone model when the configuration does not set one. */
export const DEFAULT_VOICE_MODEL = 'mlx-community/higgs-audio-v2-3B-mlx-q8';

/** The machine configuration file, relative to the home directory. */
export const MACHINE_CONFIG_PATH = '.config/thor-demo/config.yaml';

/**
 * Reads `~/.config/thor-demo/config.yaml`, validating each section on its own. Path values expand like `aidemo.env`
 * and must be absolute. A missing file, an empty file, and an empty section set nothing.
 */
export function readMachineConfig({ env, homeDir }: MachineConfigInput): MachineConfigResult {
  const configPath = path.join(homeDir, MACHINE_CONFIG_PATH);
  if (!existsSync(configPath)) {
    return { ok: true, archive: { ok: true, root: undefined }, voice: { ok: true, voice: undefined } };
  }

  function fail(problem: string): { ok: false; message: string } {
    return { ok: false, message: `${configPath}: ${problem}` };
  }

  let parsed: unknown;
  try {
    parsed = parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    return fail(`cannot be read as YAML (${describeError(error)})`);
  }

  const document = parsed ?? {};
  if (!isRecord(document)) return fail('must be a mapping');

  const unknownKey = findUnknownKey(document, ['archive', 'voice']);
  if (unknownKey !== undefined) return fail(`unknown key "${unknownKey}"; the keys are archive and voice`);

  const paths = { env, homeDir };
  const archive = readArchiveSection(document['archive'], paths);
  const voice = readVoiceSection(document['voice'], paths);

  return {
    ok: true,
    archive: archive.ok ? archive : fail(archive.problem),
    voice: voice.ok ? voice : fail(voice.problem),
  };
}

// region | Helpers

type SectionResult<T> = ({ ok: true } & T) | { ok: false; problem: string };

/** Reads the `archive` section. */
function readArchiveSection(section: unknown, paths: MachineConfigInput): SectionResult<{ root: string | undefined }> {
  if (section === undefined || section === null) return { ok: true, root: undefined };
  if (!isRecord(section)) return { ok: false, problem: 'archive must be a mapping' };

  const unknownKey = findUnknownKey(section, ['root']);
  if (unknownKey !== undefined) return { ok: false, problem: `unknown key "archive.${unknownKey}"; the key is root` };

  const raw = section['root'];
  if (raw === undefined || raw === null) return { ok: true, root: undefined };

  const root = readAbsolutePath('archive.root', raw, paths);
  return root.ok ? { ok: true, root: root.value } : root;
}

/** Reads a configured path, expanding it and requiring the result to be absolute. */
function readAbsolutePath(
  key: string,
  raw: unknown,
  { env, homeDir }: MachineConfigInput,
): SectionResult<{ value: string }> {
  if (typeof raw !== 'string' || raw === '') return { ok: false, problem: `${key} must be a non-empty string` };

  const expansion = expandValue(raw, env, homeDir);
  if (!expansion.ok) return { ok: false, problem: `${key}: ${expansion.problem}` };
  if (!path.isAbsolute(expansion.value)) {
    return { ok: false, problem: `${key} must be an absolute path, not "${expansion.value}"` };
  }

  return { ok: true, value: expansion.value };
}

/** Reads a configured path that must be set. Whether the file exists is for the command that reads it to check. */
function readRequiredPath(key: string, raw: unknown, paths: MachineConfigInput): SectionResult<{ value: string }> {
  if (raw === undefined || raw === null) return { ok: false, problem: `${key} is required` };
  return readAbsolutePath(key, raw, paths);
}

/** Reads the `voice` section, applying the defaults for `home` and `model`. */
function readVoiceSection(
  section: unknown,
  paths: MachineConfigInput,
): SectionResult<{ voice: VoiceConfig | undefined }> {
  if (section === undefined || section === null) return { ok: true, voice: undefined };
  if (!isRecord(section)) return { ok: false, problem: 'voice must be a mapping' };

  const unknownKey = findUnknownKey(section, ['home', 'model', 'reference']);
  if (unknownKey !== undefined) {
    return { ok: false, problem: `unknown key "voice.${unknownKey}"; the keys are home, model, and reference` };
  }

  const rawHome = section['home'];
  const home =
    rawHome === undefined || rawHome === null
      ? { ok: true as const, value: path.join(paths.homeDir, DEFAULT_VOICE_HOME) }
      : readAbsolutePath('voice.home', rawHome, paths);
  if (!home.ok) return home;

  const rawModel = section['model'];
  if (rawModel !== undefined && rawModel !== null && (typeof rawModel !== 'string' || rawModel === '')) {
    return { ok: false, problem: 'voice.model must be a non-empty string' };
  }
  const model = typeof rawModel === 'string' ? rawModel : DEFAULT_VOICE_MODEL;

  const reference = section['reference'];
  if (reference === undefined || reference === null) {
    return {
      ok: false,
      problem: 'voice.reference is required; set voice.reference.audio and voice.reference.transcript',
    };
  }
  if (!isRecord(reference)) return { ok: false, problem: 'voice.reference must be a mapping' };

  const unknownReferenceKey = findUnknownKey(reference, ['audio', 'transcript']);
  if (unknownReferenceKey !== undefined) {
    return {
      ok: false,
      problem: `unknown key "voice.reference.${unknownReferenceKey}"; the keys are audio and transcript`,
    };
  }

  const audio = readRequiredPath('voice.reference.audio', reference['audio'], paths);
  if (!audio.ok) return audio;

  const transcript = readRequiredPath('voice.reference.transcript', reference['transcript'], paths);
  if (!transcript.ok) return transcript;

  return {
    ok: true,
    voice: { home: home.value, model, referenceAudio: audio.value, referenceTranscript: transcript.value },
  };
}

// endregion | Helpers
