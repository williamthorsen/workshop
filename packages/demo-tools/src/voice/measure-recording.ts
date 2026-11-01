import { spawnSync } from 'node:child_process';

/** A recording's length and loudness, in seconds and dBFS. */
export interface RecordingMeasures {
  readonly durationSeconds: number;
  readonly meanVolumeDb: number;
  readonly peakVolumeDb: number;
}

/** Measures a recording with ffmpeg's `volumedetect` filter, or returns `undefined` when ffmpeg reports no measures. */
export function measureRecording(file: string): RecordingMeasures | undefined {
  const { stderr } = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-nostats', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'],
    {
      encoding: 'utf8',
    },
  );
  return parseRecordingMeasures(stderr);
}

/** Reads the duration and the `volumedetect` levels from ffmpeg's report. */
export function parseRecordingMeasures(report: string): RecordingMeasures | undefined {
  const duration = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(report);
  const mean = /mean_volume: (-?[\d.]+) dB/.exec(report);
  const peak = /max_volume: (-?[\d.]+) dB/.exec(report);
  if (duration === null || mean === null || peak === null) return undefined;

  const [hours = 0, minutes = 0, seconds = 0] = duration.slice(1).map(Number);
  const [meanVolumeDb = NaN] = mean.slice(1).map(Number);
  const [peakVolumeDb = NaN] = peak.slice(1).map(Number);
  return { durationSeconds: hours * 3_600 + minutes * 60 + seconds, meanVolumeDb, peakVolumeDb };
}
