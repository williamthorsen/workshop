import { hashUtf8 } from '../portable/hash-content.ts';
import { hashValue } from '../portable/hashValue.ts';
import type { CompositorConfig } from '../schemas/config-schemas.ts';
import type { PlanFingerprint } from '../schemas/plan-schemas.ts';
import type { CompositionSnapshot } from '../snapshot/captureSnapshot.ts';
import { assertSnapshotFits } from './compose/assertSnapshotFits.ts';

/**
 * Computes the fingerprint of the inputs a plan over `config` and `snapshot` would be composed from.
 *
 * Exported beside `composePlan` so that detecting staleness is one comparison: a consumer holding a plan captures
 * afresh, computes this, and compares `composite`. The parts beside it name what moved when the two differ.
 *
 * The config is digested over its parsed value rather than over the bytes of any file, so a config loaded from disk and
 * the same config edited in memory fingerprint alike -- which is what makes a what-if plan comparable to the plan it
 * was derived from.
 *
 * Refuses whatever `composePlan` refuses, a fingerprint over a snapshot the plan flow would turn away comparing against
 * nothing meaningful.
 */
export function computeFingerprint(config: CompositorConfig, snapshot: CompositionSnapshot): PlanFingerprint {
  assertSnapshotFits(config, snapshot);

  const configDigest = hashValue(config);
  const sources = snapshot.sourceDigests.map(({ sourceId, digest }) => ({ sourceId, digest }));
  const targetState = snapshot.targetState.map(({ targetId, digest }) => ({ targetId, digest }));
  const parts = [configDigest, ...sources.map(({ digest }) => digest), ...targetState.map(({ digest }) => digest)];

  return { config: configDigest, sources, targetState, composite: hashUtf8(parts.join('\n')) };
}
