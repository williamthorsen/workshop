import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import type { VoiceConfig } from '../config/read-machine-config.ts';
import type { RunInvocation } from './invocation.ts';
import { measureRecording } from './measure-recording.ts';
import { prepareRecorder } from './prepare-recorder.ts';

/** What recording reports through, writes the transcript to, and runs programs with. */
export interface VoiceRecordEffects {
  readonly report: (line: string) => void;
  readonly run: RunInvocation;
  /** Writes text that the reader reads aloud, unprefixed. */
  readonly show: (text: string) => void;
}

/** The outcome of a command that writes a result to stdout: the result, or what stopped the command. */
export type VoiceCommandOutcome = { ok: true; output: string } | { ok: false; message: string };

/** The longest take, counted from the first captured audio. */
const RECORD_LIMIT_SECONDS = 60;

/** A peak below this suggests a microphone too far away for a clean clone. */
const QUIET_PEAK_DB = -20;

/** Lists the microphones that the recorder can open, one name per line. */
export async function listMicrophones(home: string, effects: VoiceRecordEffects): Promise<VoiceCommandOutcome> {
  const prepared = await prepareRecorder(home, effects.run, effects.report);
  if (!prepared.ok) return prepared;

  const { status, stderr, stdout } = spawnSync(prepared.recorder, ['list'], { encoding: 'utf8' });
  if (status !== 0) return { ok: false, message: `cannot list the microphones: ${stderr.trim()}` };
  return { ok: true, output: stdout };
}

/**
 * Shows the transcript, records the reference from `microphone`, or the default input, until Enter or the limit,
 * then saves it to `voice.reference.audio` in the format that its extension names, keeping the previous take beside
 * it. It reports the take's length and loudness and plays it back.
 */
export async function performVoiceRecord(
  { microphone, voice }: { microphone: string | undefined; voice: VoiceConfig },
  effects: VoiceRecordEffects,
): Promise<VoiceCommandOutcome> {
  const { report, run, show } = effects;
  const { referenceAudio, referenceTranscript } = voice;

  const prepared = await prepareRecorder(voice.home, run, report);
  if (!prepared.ok) return prepared;

  if (existsSync(referenceTranscript)) {
    report(`read this aloud, from ${referenceTranscript}:`);
    show(`\n${readFileSync(referenceTranscript, 'utf8').trim()}\n\n`);
  } else {
    report(`${referenceTranscript} does not exist; before voice setup, write in it exactly what the recording says`);
  }

  mkdirSync(path.dirname(referenceAudio), { recursive: true });
  const workDir = mkdtempSync(path.join(path.dirname(referenceAudio), '.recording-'));
  try {
    const captured = path.join(workDir, 'capture.wav');
    const recorded = await run({
      command: prepared.recorder,
      args: ['record', microphone ?? '', captured, String(RECORD_LIMIT_SECONDS)],
      env: {},
      interactive: true,
    });
    if (!recorded.ok) return recorded;

    const converted = path.join(workDir, `converted${path.extname(referenceAudio)}`);
    const conversion = await run({
      command: 'ffmpeg',
      args: ['-nostdin', '-loglevel', 'error', '-i', captured, converted],
      env: {},
    });
    if (!conversion.ok) return { ok: false, message: `cannot save the take: ${conversion.message}` };

    if (existsSync(referenceAudio)) {
      const previous = formatPreviousPath(referenceAudio);
      renameSync(referenceAudio, previous);
      report(`kept the previous take as ${previous}`);
    }
    renameSync(converted, referenceAudio);
  } finally {
    rmSync(workDir, { force: true, recursive: true });
  }

  const measures = measureRecording(referenceAudio);
  if (measures !== undefined) {
    const { durationSeconds, meanVolumeDb, peakVolumeDb } = measures;
    report(
      `recorded ${durationSeconds.toFixed(1)} seconds to ${referenceAudio}; peak ${peakVolumeDb} dB, mean ${meanVolumeDb} dB`,
    );
    if (peakVolumeDb < QUIET_PEAK_DB) {
      report(`warning: the take is quiet; record closer to the microphone for a cleaner clone`);
    }
  }

  report('playing the take back; press Ctrl-C to stop');
  // Leave Ctrl-C, which the terminal sends to the player and to this process alike, to stop the player alone.
  process.on('SIGINT', ignoreSignal);
  try {
    await run({ command: 'afplay', args: [referenceAudio], env: {} });
  } finally {
    process.off('SIGINT', ignoreSignal);
  }
  return { ok: true, output: `${referenceAudio}\n` };
}

// region | Helpers

/** Returns the path that keeps the previous take: `reference.wav` becomes `reference.previous.wav`. */
function formatPreviousPath(filePath: string): string {
  const extension = path.extname(filePath);
  return `${filePath.slice(0, filePath.length - extension.length)}.previous${extension}`;
}

/** Handles a signal by doing nothing, which keeps it from ending this process. */
function ignoreSignal(): void {}

// endregion | Helpers
