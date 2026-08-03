import { hashUtf8 } from '../../portable/hash-content.ts';
import type { SourceEntry } from '../../schemas/descriptor-schemas.ts';
import type { PlanFingerprint } from '../../schemas/plan-schemas.ts';
import type { TargetEntry } from '../../schemas/target-schemas.ts';

/**
 * Builds the fingerprint of the inputs the representative sample was computed from.
 *
 * Each digest is derived from the table it covers, so a source or target added to one cannot go unrecorded here.
 */
export function buildFingerprint(
  sources: ReadonlyArray<SourceEntry>,
  targets: ReadonlyArray<TargetEntry>,
): PlanFingerprint {
  const configDigest = hashUtf8('codeassembly.yaml');
  const sourceDigests = sources.map((source) => ({ sourceId: source.id, digest: hashUtf8(`source:${source.id}`) }));
  const targetDigests = targets.map((target) => ({ targetId: target.id, digest: hashUtf8(`target:${target.id}`) }));

  return {
    config: configDigest,
    sources: sourceDigests,
    targetState: targetDigests,
    composite: hashUtf8(
      [configDigest, ...sourceDigests.map((entry) => entry.digest), ...targetDigests.map((entry) => entry.digest)].join(
        '\n',
      ),
    ),
  };
}
