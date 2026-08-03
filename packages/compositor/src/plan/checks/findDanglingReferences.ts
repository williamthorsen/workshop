import { collectIds } from '../../consistency/collectIds.ts';
import { createRequireKnown } from '../../consistency/createRequireKnown.ts';
import type { Violation } from '../../consistency/Violation.ts';
import type { Plan } from '../../schemas/plan-schemas.ts';

/** Reports each id reference that names no entry in the table it points at. */
export function findDanglingReferences(plan: Plan): Array<Violation> {
  const artifactIds = collectIds(plan.artifacts);
  const kindIds = collectIds(plan.kinds);
  const partialIds = collectIds(plan.partials);
  const sourceIds = collectIds(plan.sources);
  const targetIds = collectIds(plan.targets);
  const tierIds = collectIds(plan.tiers);

  const violations: Array<Violation> = [];
  const requireKnown = createRequireKnown(violations);

  for (const [index, entry] of plan.fingerprint.sources.entries()) {
    requireKnown(sourceIds, entry.sourceId, `fingerprint.sources[${index}].sourceId`, 'sources');
  }
  for (const [index, entry] of plan.fingerprint.targetState.entries()) {
    requireKnown(targetIds, entry.targetId, `fingerprint.targetState[${index}].targetId`, 'targets');
  }

  for (const [index, artifact] of plan.artifacts.entries()) {
    const at = `artifacts[${index}]`;
    requireKnown(kindIds, artifact.kindId, `${at}.kindId`, 'kinds');
    const edges = artifact.dependsOn ?? [];
    for (const [edgeIndex, edge] of edges.entries()) {
      requireKnown(artifactIds, edge.to, `${at}.dependsOn[${edgeIndex}].to`, 'artifacts');
      requireKnown(partialIds, edge.partialId, `${at}.dependsOn[${edgeIndex}].partialId`, 'partials');
    }
    // A removed artifact carries no `seededBy` at all, so the status narrowing is what reaches the field.
    const seeds = artifact.status === 'removed' ? [] : artifact.seededBy;
    for (const [seedIndex, seed] of seeds.entries()) {
      requireKnown(tierIds, seed.tierId, `${at}.seededBy[${seedIndex}].tierId`, 'tiers');
    }
    if (artifact.resolution !== undefined) {
      requireKnown(sourceIds, artifact.resolution.winner.sourceId, `${at}.resolution.winner.sourceId`, 'sources');
      for (const [loserIndex, loser] of artifact.resolution.shadowed.entries()) {
        requireKnown(sourceIds, loser.sourceId, `${at}.resolution.shadowed[${loserIndex}].sourceId`, 'sources');
      }
    }
  }

  for (const [index, partial] of plan.partials.entries()) {
    requireKnown(sourceIds, partial.sourceId, `partials[${index}].sourceId`, 'sources');
  }

  for (const [index, file] of plan.files.entries()) {
    const at = `files[${index}]`;
    requireKnown(targetIds, file.targetId, `${at}.targetId`, 'targets');
    for (const [contributorIndex, contribution] of file.contributors.artifacts.entries()) {
      const path = `${at}.contributors.artifacts[${contributorIndex}].artifactId`;
      requireKnown(artifactIds, contribution.artifactId, path, 'artifacts');
    }
    for (const [contributorIndex, partialId] of file.contributors.partials.entries()) {
      requireKnown(partialIds, partialId, `${at}.contributors.partials[${contributorIndex}]`, 'partials');
    }
  }

  return violations;
}
