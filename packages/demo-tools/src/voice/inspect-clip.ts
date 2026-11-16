import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

/** A span of a clip that is quieter than the silence level, in seconds from the clip's start. */
export interface Silence {
  readonly endSeconds: number;
  readonly startSeconds: number;
}

/** A clip's length and the silences in it. */
export interface ClipMeasures {
  readonly durationSeconds: number;
  readonly silences: readonly Silence[];
}

/** Whether a clip may be passed on, and why not when it may not. */
export type ClipVerdict = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** The level below which audio counts as silence: the level of the #665 measurements. */
const SILENCE_LEVEL_DB = -40;

/** The shortest quiet span that counts as silence: short enough to count a sentence pause. */
const MIN_SILENCE_SECONDS = 0.5;

/** Below this much audible audio, a clip counts as silent throughout. */
const MIN_SPEECH_SECONDS = 0.3;

/**
 * The longest silence of a good clip, wherever it falls: good clips measured on Higgs Audio v2 are silent for at most
 * 2.2 s at a time, and a defective take opened with 4.7 s of silence.
 */
const MAX_SILENCE_SECONDS = 3;

/**
 * The fewest seconds of speech per character of text: half the 0.067 s that good clips measured on Higgs Audio v2 q8.
 */
const MIN_SPEECH_SECONDS_PER_CHARACTER = 0.03;

/** Below this many characters, pauses dominate a clip, so its speech time says nothing about truncation. */
const MIN_CHARACTERS_FOR_SPEECH_CHECK = 40;

const execFileAsync = promisify(execFile);

/**
 * Judges a clip of `text`: silent throughout, containing a long silence anywhere, or too short for its text is
 * rejected. A rejection for a long silence names the longest one and where it falls.
 */
export function judgeClip({ durationSeconds, silences }: ClipMeasures, text: string): ClipVerdict {
  const silentSeconds = silences.reduce((total, { endSeconds, startSeconds }) => total + endSeconds - startSeconds, 0);
  const speechSeconds = Math.max(0, durationSeconds - silentSeconds);
  if (speechSeconds < MIN_SPEECH_SECONDS) return { ok: false, reason: 'silent throughout' };

  const longest = findLongestSilence(silences);
  if (longest !== undefined && longest.endSeconds - longest.startSeconds > MAX_SILENCE_SECONDS) {
    const length = formatSeconds(longest.endSeconds - longest.startSeconds);
    return { ok: false, reason: `${length} of silence ${describePosition(longest, durationSeconds)}` };
  }

  const characters = text.trim().length;
  if (characters >= MIN_CHARACTERS_FOR_SPEECH_CHECK && speechSeconds < characters * MIN_SPEECH_SECONDS_PER_CHARACTER) {
    return { ok: false, reason: `${formatSeconds(speechSeconds)} of speech for ${characters} characters` };
  }
  return { ok: true };
}

/**
 * Measures a clip with ffmpeg's `silencedetect`, through a temporary file because ffmpeg cannot read the duration of
 * piped MP3. Rejects when ffmpeg cannot run or cannot read the clip.
 */
export async function measureClip(audio: Buffer): Promise<ClipMeasures> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'thor-demo-clip-'));
  try {
    const file = path.join(dir, 'clip.mp3');
    await writeFile(file, audio);
    const { stderr } = await execFileAsync('ffmpeg', [
      '-nostdin',
      '-hide_banner',
      '-nostats',
      '-i',
      file,
      '-af',
      `silencedetect=noise=${SILENCE_LEVEL_DB}dB:d=${MIN_SILENCE_SECONDS}`,
      '-f',
      'null',
      '-',
    ]);
    const measures = parseSilenceReport(stderr);
    if (measures === undefined) throw new Error('ffmpeg reported no duration for the clip');
    return measures;
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

/**
 * Reads the duration and the silences from ffmpeg's `silencedetect` report, closing a silence that runs to the end of
 * the clip at the clip's duration.
 */
export function parseSilenceReport(report: string): ClipMeasures | undefined {
  const duration = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(report);
  if (duration === null) return undefined;
  const [hours = 0, minutes = 0, seconds = 0] = duration.slice(1).map(Number);
  const durationSeconds = hours * 3600 + minutes * 60 + seconds;

  const silences: Silence[] = [];
  let startSeconds: number | undefined;
  for (const line of report.split('\n')) {
    const start = /silence_start: (-?[\d.]+)/.exec(line)?.[1];
    if (start !== undefined) startSeconds = Math.max(0, Number(start));
    const end = /silence_end: ([\d.]+)/.exec(line)?.[1];
    if (end === undefined || startSeconds === undefined) continue;
    silences.push({ endSeconds: Math.min(durationSeconds, Number(end)), startSeconds });
    startSeconds = undefined;
  }
  if (startSeconds !== undefined) silences.push({ endSeconds: durationSeconds, startSeconds });
  return { durationSeconds, silences };
}

// region | Helpers

/** Describes where a silence falls in a clip: at its start, at its end, or how far into it. */
function describePosition({ endSeconds, startSeconds }: Silence, durationSeconds: number): string {
  if (startSeconds === 0) return 'at the start';
  if (endSeconds >= durationSeconds) return 'at the end';
  return `${formatSeconds(startSeconds)} into the clip`;
}

/** Returns the longest of the silences, or `undefined` when there are none. */
function findLongestSilence(silences: readonly Silence[]): Silence | undefined {
  let longest: Silence | undefined;
  for (const silence of silences) {
    if (
      longest === undefined ||
      silence.endSeconds - silence.startSeconds > longest.endSeconds - longest.startSeconds
    ) {
      longest = silence;
    }
  }
  return longest;
}

/** Formats seconds to one decimal place, for a reason that a person reads. */
function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(1)} s`;
}

// endregion | Helpers
