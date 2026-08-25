import type { SweepRecorder } from '../sweepRecorder.ts';

/** Returns a recorder paired with the sweeps reported to it, in the order they arrived. */
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
