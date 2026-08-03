import type { Plan } from '../schemas/plan-schemas.ts';
import { PLAN_SCHEMA_VERSION } from '../schemas/plan-schemas.ts';
import { buildArtifacts } from './representative/buildArtifacts.ts';
import { buildFiles } from './representative/buildFiles.ts';
import { buildFingerprint } from './representative/buildFingerprint.ts';
import { buildKinds } from './representative/buildKinds.ts';
import { buildPartials } from './representative/buildPartials.ts';
import { buildSources } from './representative/buildSources.ts';
import { buildTargets } from './representative/buildTargets.ts';
import { buildTiers } from './representative/buildTiers.ts';
import { createBlobStore } from './representative/createBlobStore.ts';

/**
 * A plan exercising every shape the contract has to carry.
 *
 * Modelled on a guidance-distribution run: three precedence-ordered sources feeding two targets, with an artifact
 * reached by three routes, an artifact shadowing two losers beside one the lowest-precedence source wins, three
 * rulebooks aggregated into one region with per-artifact markers, entry-level ownership of a structured config, a
 * byte-copied asset, a file apply will skip, an artifact two tiers both seed, and all four diff statuses.
 */
export function buildRepresentativeSample(): Plan {
  const blobs = createBlobStore();
  const files = buildFiles(blobs);
  const sources = buildSources();
  const targets = buildTargets();

  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    engineVersion: '0.0.0',
    contentAvailability: 'complete',
    fingerprint: buildFingerprint(sources, targets),
    kinds: buildKinds(),
    sources,
    targets,
    tiers: buildTiers(),
    artifacts: buildArtifacts(),
    partials: buildPartials(),
    files,
    blobs: blobs.toTable(),
  };
}
