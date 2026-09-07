import type { SweepRecorder } from '../sweepRecorder.ts';

/** Returns a recorder paired with the sweeps reported to it, in the order they were reported. */
export function createRecorder(): { recorder: SweepRecorder; scanned: (readonly string[])[] } {
  const scanned: (readonly string[])[] = [];
  return {
    recorder: {
      recordScanned: (paths) => {
        scanned.push(paths);
      },
    },
    scanned,
  };
}
