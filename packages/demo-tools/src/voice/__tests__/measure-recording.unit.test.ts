import { describe, expect, it } from 'vitest';

import { parseRecordingMeasures } from '../measure-recording.ts';

describe(parseRecordingMeasures, () => {
  it("reads the duration and the levels from ffmpeg's report", () => {
    const report = `Input #0, wav, from 'take.wav':
  Duration: 00:01:02.50, bitrate: 768 kb/s
[Parsed_volumedetect_0 @ 0x1] mean_volume: -24.6 dB
[Parsed_volumedetect_0 @ 0x1] max_volume: -3.0 dB
`;

    expect(parseRecordingMeasures(report)).toStrictEqual({
      durationSeconds: 62.5,
      meanVolumeDb: -24.6,
      peakVolumeDb: -3,
    });
  });

  it('returns undefined for a report without levels', () => {
    expect(parseRecordingMeasures('take.wav: Invalid data found when processing input')).toBeUndefined();
  });
});
