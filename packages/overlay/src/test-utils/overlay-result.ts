import type { OverlayResult } from '../modes/types.ts';

/** Builds an `OverlayResult` from a converged-verify baseline, applying the given overrides. */
export function buildOverlayResult(overrides: Partial<OverlayResult> = {}): OverlayResult {
  return {
    mode: 'verify',
    entries: [],
    scripts: { ranCount: 0, ok: true },
    counts: { created: 0, deleted: 0, forced: 0, conflicts: 0, pending: 0 },
    exitCode: 0,
    ...overrides,
  };
}
