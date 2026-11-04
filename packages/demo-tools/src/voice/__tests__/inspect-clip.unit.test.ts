import { describe, expect, it } from 'vitest';

import { judgeClip, parseSilenceReport } from '../inspect-clip.ts';

const SPEECH_THEN_TRAILING_SILENCE = `Input #0, mp3, from 'clip.mp3':
  Duration: 00:00:06.00, start: 0.025057, bitrate: 64 kb/s
[Parsed_silencedetect_0 @ 0x1] silence_start: 1.999977
[Parsed_silencedetect_0 @ 0x1] silence_end: 6 | silence_duration: 4.000023
`;

describe(parseSilenceReport, () => {
  it('reads the duration and each silence', () => {
    const report = `  Duration: 00:00:04.50, start: 0.025057, bitrate: 64 kb/s
[Parsed_silencedetect_0 @ 0x1] silence_start: -0.01
[Parsed_silencedetect_0 @ 0x1] silence_end: 0.6 | silence_duration: 0.61
[Parsed_silencedetect_0 @ 0x1] silence_start: 2
[Parsed_silencedetect_0 @ 0x1] silence_end: 2.8 | silence_duration: 0.8
`;

    expect(parseSilenceReport(report)).toStrictEqual({
      durationSeconds: 4.5,
      silences: [
        { endSeconds: 0.6, startSeconds: 0 },
        { endSeconds: 2.8, startSeconds: 2 },
      ],
    });
  });

  it('reads a silence that ends with the clip', () => {
    expect(parseSilenceReport(SPEECH_THEN_TRAILING_SILENCE)).toStrictEqual({
      durationSeconds: 6,
      silences: [{ endSeconds: 6, startSeconds: 1.999_977 }],
    });
  });

  it('closes at the duration a silence that the report leaves open', () => {
    const report = `  Duration: 00:00:05.00, start: 0.025057, bitrate: 64 kb/s
[Parsed_silencedetect_0 @ 0x1] silence_start: 3
`;

    expect(parseSilenceReport(report)?.silences).toStrictEqual([{ endSeconds: 5, startSeconds: 3 }]);
  });

  it('returns undefined for a report without a duration', () => {
    expect(parseSilenceReport('clip.mp3: Invalid data found when processing input')).toBeUndefined();
  });
});

describe(judgeClip, () => {
  const text = 'Three trails match, each with its length, its difficulty, and a note about the start.';

  it('accepts speech with sentence pauses', () => {
    const measures = { durationSeconds: 6, silences: [{ endSeconds: 3.8, startSeconds: 3 }] };

    expect(judgeClip(measures, text)).toStrictEqual({ ok: true });
  });

  it('rejects a clip that is silent throughout, before any other check', () => {
    const measures = { durationSeconds: 30, silences: [{ endSeconds: 30, startSeconds: 0 }] };

    expect(judgeClip(measures, text)).toStrictEqual({ ok: false, reason: 'silent throughout' });
  });

  it('rejects a clip that ends in a long silence', () => {
    const measures = { durationSeconds: 40, silences: [{ endSeconds: 40, startSeconds: 5.8 }] };

    expect(judgeClip(measures, text)).toStrictEqual({ ok: false, reason: '34.2 s of trailing silence' });
  });

  it('rejects a clip whose speech is far shorter than its text requires', () => {
    const measures = { durationSeconds: 1.2, silences: [] };

    expect(judgeClip(measures, text)).toStrictEqual({ ok: false, reason: '1.2 s of speech for 85 characters' });
  });

  it('accepts a short clip of a short text', () => {
    expect(judgeClip({ durationSeconds: 0.8, silences: [] }, 'Hello there.')).toStrictEqual({ ok: true });
  });
});
