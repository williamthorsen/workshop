import path from 'node:path';
import process from 'node:process';

import type { SweepRecorder } from '../check-utils/project/sweepRecorder.ts';

/** A sweep recorder that counts the distinct files examined by one check. */
export interface ExaminedRecorder extends SweepRecorder {
  /** Returns the number of distinct files recorded so far. */
  countExamined: () => number;
}

/**
 * Opens a recorder for one check, forwarding every path to the run's recorder when one is passed.
 *
 * Paths are keyed by their resolved form, as the run's ledger keys them, so a file read by two sweeps of the
 * check counts once.
 */
export function createExaminedRecorder(forwardTo?: SweepRecorder): ExaminedRecorder {
  const examined = new Set<string>();

  return {
    countExamined: () => examined.size,
    recordScanned: (paths) => {
      for (const filePath of paths) examined.add(path.resolve(process.cwd(), filePath));
      forwardTo?.recordScanned(paths);
    },
  };
}
