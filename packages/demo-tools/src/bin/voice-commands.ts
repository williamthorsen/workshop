import path from 'node:path';

import { createCli, type Writer } from '@williamthorsen/toolbelt.cli/candidate';

import {
  DEFAULT_VOICE_HOME,
  DEFAULT_VOICE_MODEL,
  MACHINE_CONFIG_PATH,
  readMachineConfig,
  type VoiceConfig,
} from '../config/read-machine-config.ts';
import { findOnPath } from '../portable/find-on-path.ts';
import { isFile } from '../portable/is-file.ts';
import { MLX_AUDIO_VERSION } from '../voice/mlx-audio/plan-install.ts';
import type { CommandContext, RunEffects } from './run.ts';

const EXIT_FAILURE = 1;

const { defineCommand, defineGroup } = createCli<CommandContext>();

/**
 * Reports the first prerequisite of a voice command that this machine lacks: macOS, Apple Silicon when
 * `appleSilicon` is set, or one of `tools` on `PATH`.
 */
export function findMissingVoicePrerequisite(
  { arch, env, platform }: RunEffects,
  appleSilicon: boolean,
  tools: readonly string[],
): string | undefined {
  if (appleSilicon && (platform !== 'darwin' || arch !== 'arm64')) {
    return `the voice clone runs on Apple Silicon (darwin on arm64) only, not ${platform} on ${arch}`;
  }
  if (platform !== 'darwin') return `the recorder runs on macOS only, not ${platform}`;

  const missing = tools.filter((tool) => findOnPath(tool, env['PATH']) === undefined);
  return missing.length === 0 ? undefined : formatMissingTools(missing);
}

/** Reads the voice section of the machine configuration, which a voice command other than microphones requires. */
export function readRequiredVoice(
  effects: RunEffects,
): { ok: true; voice: VoiceConfig } | { ok: false; problem: string } {
  const config = readMachineConfig(effects);
  if (!config.ok) return { ok: false, problem: config.message };
  if (!config.voice.ok) return { ok: false, problem: config.voice.message };
  if (config.voice.voice === undefined) {
    return {
      ok: false,
      problem: `~/${MACHINE_CONFIG_PATH} does not set voice; add voice.reference.audio and voice.reference.transcript, and optionally voice.home and voice.model`,
    };
  }
  return { ok: true, voice: config.voice.voice };
}

/** The `voice` command group, which records the reference, lists microphones, and sets up the voice clone. */
export const VOICE_GROUP = defineGroup({
  summary: "Manage the local voice clone that narrates demos in the presenter's voice",
  commands: {
    microphones: defineCommand({
      summary: 'List the microphones that voice record can use',
      description:
        'Print the name of each audio input, one per line. On first use, compile the recorder that ships with thor-demo, which requires swiftc from the Xcode Command Line Tools.',
      run: ({ context, stderr }) => runVoiceMicrophones(context, stderr),
    }),
    record: defineCommand({
      summary: 'Record the reference recording that the voice clone copies',
      description: `Print the transcript at voice.reference.transcript, record from the microphone until Enter is pressed or 60 seconds pass, and save the take to voice.reference.audio in the format that its extension names, keeping the previous take as <name>.previous.<extension>. Then report the take's length and loudness, play it back, and print its path. The recording starts once the microphone delivers audio. Requires macOS, swiftc from the Xcode Command Line Tools, and ffmpeg.`,
      flags: {
        microphone: {
          type: 'string',
          description:
            'Record from the microphone with this name, as voice microphones lists it. Default: the system input',
          valueHint: 'name',
        },
      },
      epilog: `Example:
  thor-demo voice record --microphone "MacBook Pro Microphone"`,
      run: ({ context, flags, stderr }) => runVoiceRecord(context, flags.microphone, stderr),
    }),
    setup: defineCommand({
      summary: 'Install the voice-clone server and build the voice profile',
      description: `Install mlx-audio ${MLX_AUDIO_VERSION} into a virtual environment under voice.home, download voice.model there, build a voice profile from voice.reference, and verify the install by starting the server offline on 127.0.0.1 and synthesizing a phrase in the cloned voice to <voice.home>/verify.mp3, whose path it prints. A rerun skips each step whose inputs are unchanged. Requires Apple Silicon, uv, and ffmpeg.`,
      epilog: `Configuration (the voice section of ~/${MACHINE_CONFIG_PATH}):
  voice.reference.audio       Required. A recording of the voice to clone, in any
                              format that ffmpeg reads
  voice.reference.transcript  Required. A text file containing exactly what the
                              recording says
  voice.home                  Where to install. Default: ~/${DEFAULT_VOICE_HOME}
  voice.model                 Any mlx-audio model that clones from a reference
                              recording. Default: ${DEFAULT_VOICE_MODEL}

Paths expand ~ and \${VAR} and must be absolute.`,
      run: ({ context, stderr }) => runVoiceSetup(context, stderr),
    }),
  },
});

// region | Helpers

/** Returns a reporter of a voice command's failure, which writes the problem to `stderr` and returns exit code 1. */
function createVoiceFailure(command: string, stderr: Writer): (problem: string) => number {
  return (problem) => {
    stderr.write(`thor-demo voice ${command}: ${problem}\n`);
    return EXIT_FAILURE;
  };
}

/** Names the tools absent from `PATH` and how to install each: swiftc from the Xcode tools, the rest with brew. */
function formatMissingTools(missing: readonly string[]): string {
  const list = new Intl.ListFormat('en', { type: 'conjunction' });
  const brewed = missing.filter((tool) => tool !== 'swiftc');
  const installs: string[] = [];
  if (missing.includes('swiftc')) installs.push('install the Xcode Command Line Tools with xcode-select --install');
  if (brewed.length > 0) {
    const object = brewed.length === missing.length ? (brewed.length === 1 ? 'it' : 'them') : list.format(brewed);
    installs.push(`install ${object} with brew install ${brewed.join(' ')}`);
  }
  return `${list.format(missing)} ${missing.length === 1 ? 'is' : 'are'} not on PATH; ${installs.join(', and ')}`;
}

/** Runs `voice microphones`, which installs under `voice.home`, or its default when the section is absent. */
function runVoiceMicrophones(context: CommandContext, stderr: Writer): number | undefined {
  const fail = createVoiceFailure('microphones', stderr);
  const missing = findMissingVoicePrerequisite(context.effects, false, ['swiftc']);
  if (missing !== undefined) return fail(missing);

  const config = readMachineConfig(context.effects);
  if (!config.ok) return fail(config.message);
  if (!config.voice.ok) return fail(config.voice.message);

  const home = config.voice.voice?.home ?? path.join(context.effects.homeDir, DEFAULT_VOICE_HOME);
  context.requestVoice({ kind: 'microphones', home });
  return;
}

/** Runs `voice record`: Checks the prerequisites and reads the voice section, then requests the recording. */
function runVoiceRecord(context: CommandContext, microphone: string | undefined, stderr: Writer): number | undefined {
  const fail = createVoiceFailure('record', stderr);
  const missing = findMissingVoicePrerequisite(context.effects, false, ['swiftc', 'ffmpeg']);
  if (missing !== undefined) return fail(missing);

  const voice = readRequiredVoice(context.effects);
  if (!voice.ok) return fail(voice.problem);

  context.requestVoice({ kind: 'record', microphone, voice: voice.voice });
  return;
}

/**
 * Runs `voice setup`: Checks the platform and the tools that setup needs, reads the voice section, and checks that
 * the reference files exist, then requests the setup.
 */
function runVoiceSetup(context: CommandContext, stderr: Writer): number | undefined {
  const fail = createVoiceFailure('setup', stderr);
  const missing = findMissingVoicePrerequisite(context.effects, true, ['uv', 'ffmpeg']);
  if (missing !== undefined) return fail(missing);

  const voice = readRequiredVoice(context.effects);
  if (!voice.ok) return fail(voice.problem);

  const { referenceAudio, referenceTranscript } = voice.voice;
  if (!isFile(referenceAudio)) {
    return fail(
      `voice.reference.audio names ${referenceAudio}, which does not exist; record it with thor-demo voice record`,
    );
  }
  if (!isFile(referenceTranscript)) {
    return fail(
      `voice.reference.transcript names ${referenceTranscript}, which does not exist; write in it exactly what the recording says`,
    );
  }

  context.requestVoice({ kind: 'setup', voice: voice.voice });
  return;
}

// endregion | Helpers
