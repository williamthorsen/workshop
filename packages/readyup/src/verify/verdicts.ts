import type { DriftStatus } from './checkDrift.ts';
import type { InputsStatus } from './checkInputDrift.ts';
import type { RebuildStatus } from './checkRebuild.ts';
import type { SourceStatus } from './checkSourceDrift.ts';

/** Every verdict one kit reached, gathered so each pass over a kit reads the same set. */
export interface KitVerdicts {
  drift: DriftStatus;
  inputs: InputsStatus;
  rebuild: RebuildStatus | undefined;
  source: SourceStatus;
}

/** Returns `true` when the source verdict reports a mismatch or a missing file. */
export function hasSourceFailed(status: SourceStatus): boolean {
  return status.kind === 'missing' || status.kind === 'stale';
}

/** Returns `true` when the compiled-output verdict reports a mismatch or a missing file. */
export function hasTargetFailed(status: DriftStatus): boolean {
  return status.kind === 'drift' || status.kind === 'missing';
}
