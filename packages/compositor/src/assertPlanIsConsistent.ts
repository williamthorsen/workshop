import { findResolutionOrderViolations } from './findResolutionOrderViolations.ts';
import type { DiffStatus } from './schemas/common.ts';
import type { FileEntry } from './schemas/fileSchemas.ts';
import type { Plan } from './schemas/planSchema.ts';

/** One way a plan contradicts itself, located by a path into the payload. */
export interface PlanViolation {
  readonly path: string;
  readonly message: string;
}

/** Raised when a structurally valid plan contradicts itself. */
export class PlanConsistencyError extends Error {
  override readonly name = 'PlanConsistencyError';
  readonly violations: ReadonlyArray<PlanViolation>;

  constructor(violations: ReadonlyArray<PlanViolation>) {
    super(`Plan is inconsistent:\n${violations.map(({ path, message }) => `  ${path} ${message}`).join('\n')}`);
    this.violations = violations;
  }
}

/**
 * Verifies the invariants the structural schema does not carry: that every id reference resolves, that a plan claiming
 * complete content holds every body it references, and that each file's recorded status agrees with its two sides.
 *
 * Normalizing the payload into id-keyed tables is what makes a dangling reference expressible at all, so these checks
 * close the hazard that design introduced. They live here because a refinement inside the schema would be invisible to
 * `z.toJSONSchema`, leaving a generated JSON Schema accepting plans this package rejects.
 *
 * Every violation is collected before throwing, so one run reports all of them.
 */
export function assertPlanIsConsistent(plan: Plan): void {
  const violations = [
    ...findDuplicateIds(plan),
    ...findDuplicateFileKeys(plan),
    ...findDanglingReferences(plan),
    ...findMisplacedPartialReferences(plan),
    ...findMissingBlobs(plan),
    ...findPlanResolutionOrderViolations(plan),
    ...findStatusDisagreements(plan),
  ];

  if (violations.length > 0) {
    throw new PlanConsistencyError(violations);
  }
}

// region | Helpers

/** The id of every entry in a table. */
function collectIds(entries: ReadonlyArray<{ id: string }>): ReadonlySet<string> {
  return new Set(entries.map((entry) => entry.id));
}

/** Violations for each id reference that names no entry in the table it points at. */
function findDanglingReferences(plan: Plan): Array<PlanViolation> {
  const artifactIds = collectIds(plan.artifacts);
  const kindIds = collectIds(plan.kinds);
  const partialIds = collectIds(plan.partials);
  const sourceIds = collectIds(plan.sources);
  const targetIds = collectIds(plan.targets);

  const violations: Array<PlanViolation> = [];
  const requireKnown = (known: ReadonlySet<string>, id: string | undefined, path: string, table: string): void => {
    if (id !== undefined && !known.has(id)) {
      violations.push({ path, message: `references "${id}", which is not an entry in ${table}` });
    }
  };

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

/**
 * Violations for each destination two file entries both claim.
 *
 * `files` carries no id because `(targetId, path)` is its natural key, so this is the id check applied to that pair: a
 * consumer keying files by destination silently drops one of a repeated pair, and the two can disagree on status,
 * ownership, and contributors.
 */
function findDuplicateFileKeys(plan: Plan): Array<PlanViolation> {
  const claimed = new Map<string, Set<string>>();
  const violations: Array<PlanViolation> = [];

  for (const [index, file] of plan.files.entries()) {
    const paths = claimed.get(file.targetId) ?? new Set<string>();
    if (paths.has(file.path)) {
      violations.push({
        path: `files[${index}]`,
        message: `repeats the destination "${file.path}" within target "${file.targetId}"`,
      });
    }
    paths.add(file.path);
    claimed.set(file.targetId, paths);
  }

  return violations;
}

/** Violations for each table carrying the same id twice, which would make every reference to it ambiguous. */
function findDuplicateIds(plan: Plan): Array<PlanViolation> {
  const tables = [
    ['artifacts', plan.artifacts],
    ['kinds', plan.kinds],
    ['partials', plan.partials],
    ['sources', plan.sources],
    ['targets', plan.targets],
  ] as const;

  return tables.flatMap(([name, entries]) => {
    const seen = new Set<string>();
    const repeated = new Set<string>();
    for (const { id } of entries) {
      if (seen.has(id)) {
        repeated.add(id);
      }
      seen.add(id);
    }
    return [...repeated].map((id) => ({ path: name, message: `carries "${id}" more than once` }));
  });
}

/** Violations for each edge naming a partial it could not have been read from. */
function findMisplacedPartialReferences(plan: Plan): Array<PlanViolation> {
  const violations: Array<PlanViolation> = [];
  for (const [index, artifact] of plan.artifacts.entries()) {
    const edges = artifact.dependsOn ?? [];
    for (const [edgeIndex, edge] of edges.entries()) {
      if (edge.partialId !== undefined && edge.via !== 'token') {
        violations.push({
          path: `artifacts[${index}].dependsOn[${edgeIndex}].partialId`,
          message: `is set on a "${edge.via}" edge, and only a token edge is read from a partial`,
        });
      }
    }
  }
  return violations;
}

/** Violations for each file body a plan claiming complete content does not carry. */
function findMissingBlobs(plan: Plan): Array<PlanViolation> {
  if (plan.contentAvailability !== 'complete') {
    return [];
  }

  const carried = new Set(Object.keys(plan.blobs));
  const violations: Array<PlanViolation> = [];
  for (const [index, file] of plan.files.entries()) {
    for (const side of ['current', 'planned'] as const) {
      const hash = side === 'current' ? file.current?.hash : file.planned?.hash;
      if (hash !== undefined && !carried.has(hash)) {
        violations.push({
          path: `files[${index}].${side}.hash`,
          message: `names "${hash}", which blobs does not carry`,
        });
      }
    }
  }
  return violations;
}

/** Violations for each artifact whose shadowed candidates contradict source precedence. */
function findPlanResolutionOrderViolations(plan: Plan): Array<PlanViolation> {
  const entries = plan.artifacts.map((artifact, index) => ({
    basePath: `artifacts[${index}].resolution`,
    resolution: artifact.resolution,
  }));
  return findResolutionOrderViolations(entries, plan.sources);
}

/** Violations for each file whose recorded status disagrees with the sides it carries. */
function findStatusDisagreements(plan: Plan): Array<PlanViolation> {
  const violations: Array<PlanViolation> = [];
  for (const [index, file] of plan.files.entries()) {
    const implied = implyStatus(file);
    if (implied === undefined) {
      violations.push({ path: `files[${index}]`, message: 'carries neither a current nor a planned side' });
    } else if (implied !== file.status) {
      violations.push({
        path: `files[${index}].status`,
        message: `is "${file.status}", but its sides describe "${implied}"`,
      });
    }
    if (file.blocked !== undefined && file.status === 'unchanged') {
      violations.push({
        path: `files[${index}].blocked`,
        message: 'is set on a file that would not be written anyway',
      });
    }
  }
  return violations;
}

/** The status a file's two sides describe, or `undefined` when it carries neither. */
function implyStatus(file: FileEntry): DiffStatus | undefined {
  if (file.current === undefined) {
    return file.planned === undefined ? undefined : 'added';
  }
  if (file.planned === undefined) {
    return 'removed';
  }
  return file.current.hash === file.planned.hash ? 'unchanged' : 'changed';
}

// endregion | Helpers
