import { collectIds } from '../../consistency/collectIds.ts';
import { createRequireKnown } from '../../consistency/createRequireKnown.ts';
import { findGraphDanglingReferences } from '../../consistency/findGraphDanglingReferences.ts';
import type { Violation } from '../../consistency/Violation.ts';
import type { Plan } from '../../schemas/plan-schemas.ts';

/**
 * Reports each id reference that names no entry in the table it points at.
 *
 * The artifact and partial tables are checked by the shared graph check, which a closure calls too; what is left here
 * is what a plan alone contains. Violations follow the fingerprint, the targets, the shared graph, and then the files,
 * so the reported order tracks the payload.
 */
export function findDanglingReferences(plan: Plan): Array<Violation> {
  const artifactIds = collectIds(plan.artifacts);
  const partialIds = collectIds(plan.partials);
  const sourceIds = collectIds(plan.sources);
  const targetIds = collectIds(plan.targets);
  const tokenKindIds = collectIds(plan.tokenKinds);

  const violations: Array<Violation> = [];
  const requireKnown = createRequireKnown(violations);

  for (const [index, entry] of plan.fingerprint.sources.entries()) {
    requireKnown(sourceIds, entry.sourceId, `fingerprint.sources[${index}].sourceId`, 'sources');
  }
  for (const [index, entry] of plan.fingerprint.targetState.entries()) {
    requireKnown(targetIds, entry.targetId, `fingerprint.targetState[${index}].targetId`, 'targets');
  }

  for (const [index, target] of plan.targets.entries()) {
    for (const [mappingIndex, mapping] of target.tokenMappings.entries()) {
      const at = `targets[${index}].tokenMappings[${mappingIndex}].kindId`;
      requireKnown(tokenKindIds, mapping.kindId, at, 'tokenKinds');
    }
  }

  violations.push(...findGraphDanglingReferences(plan));

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
