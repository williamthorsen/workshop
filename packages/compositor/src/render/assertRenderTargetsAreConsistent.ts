import { collectIds } from '../consistency/collectIds.ts';
import { ConsistencyError } from '../consistency/ConsistencyError.ts';
import { countCaptureGroups } from '../consistency/countCaptureGroups.ts';
import { createRequireKnown } from '../consistency/createRequireKnown.ts';
import { findDuplicateIds } from '../consistency/findDuplicateIds.ts';
import type { Violation } from '../consistency/Violation.ts';
import { ARTIFACT_ID_PLACEHOLDER } from '../deployment/contribution-markers.ts';
import { assertMarkersAreUsable } from '../ownership/region-matching.ts';
import type { KindDescriptor } from '../schemas/descriptor-schemas.ts';
import type { MarkerPair, RenderTarget } from '../schemas/render-target-schemas.ts';

/** One way a set of render-target declarations contradicts itself, located by a path into it. */
export type RenderTargetViolation = Violation;

/** Raised when structurally valid render-target declarations contradict themselves. */
export class RenderTargetConsistencyError extends ConsistencyError {
  override readonly name = 'RenderTargetConsistencyError';

  constructor(violations: ReadonlyArray<RenderTargetViolation>) {
    super('Render targets', violations);
  }
}

/**
 * Verifies what the structural schema cannot: that no target repeats an id, a stage kind, or a deployed kind, that
 * every deployment names a kind in `kinds`, that a region deployment's markers and host can do their jobs, and that
 * each link grammar compiles and captures exactly one group.
 *
 * A stage declared twice would run twice, and a kind deployed twice would put one artifact in two places; both are
 * authoring mistakes a declaration can express and no render could act on. Checking them here rather than at the first
 * body that happens to reach the stage is what makes a bad declaration a validation result rather than a surprise
 * part-way through a plan. The marker checks are the same bargain against transforms that would otherwise throw at the
 * first host they were run over.
 *
 * Every violation is collected before throwing, so one run reports all of them. The order of the checks below is the
 * order they are reported in.
 */
export function assertRenderTargetsAreConsistent(
  targets: ReadonlyArray<RenderTarget>,
  kinds: ReadonlyArray<KindDescriptor>,
): void {
  const kindIds = collectIds(kinds);
  const violations: Array<Violation> = findDuplicateIds([['targets', targets]]);
  const requireKnown = createRequireKnown(violations);

  for (const [index, target] of targets.entries()) {
    const at = `targets[${index}]`;
    collectRepeats(
      target.deployments.map((deployment) => deployment.kindId),
      `${at}.deployments`,
      'deploys',
      violations,
    );
    collectRepeats(
      target.stages.map((stage) => stage.kind),
      `${at}.stages`,
      'runs',
      violations,
    );

    const layoutRoots = target.deployments
      .filter((deployment) => deployment.form === 'tree')
      .map((deployment) => deployment.layout.root)
      .filter((root) => root !== '');

    for (const [position, deployment] of target.deployments.entries()) {
      requireKnown(kindIds, deployment.kindId, `${at}.deployments[${position}].kindId`, 'kinds');
      if (deployment.form !== 'region') {
        continue;
      }
      const deployedAt = `${at}.deployments[${position}]`;
      collectMarkerFaults(deployment.markers, `${deployedAt}.markers`, violations);
      collectMarkerFaults(deployment.contributionMarkers, `${deployedAt}.contributionMarkers`, violations);
      collectPlaceholderFaults(deployment.contributionMarkers, `${deployedAt}.contributionMarkers`, violations);
      collectHostCollisions(deployment.host, layoutRoots, `${deployedAt}.host`, violations);
    }

    for (const [position, stage] of target.stages.entries()) {
      if (stage.kind !== 'links') {
        continue;
      }
      const groups = countCaptureGroups(stage.pattern);
      const path = `${at}.stages[${position}].pattern`;
      if (groups === undefined) {
        violations.push({ path, message: 'is not a valid regular expression' });
      } else if (groups !== 1) {
        violations.push({ path, message: `captures ${groups} groups, but exactly one names the link target` });
      }
    }
  }

  if (violations.length > 0) {
    throw new RenderTargetConsistencyError(violations);
  }
}

// region | Helpers

/**
 * Reports a host that a tree layout's root claims as a directory, or that claims a root's directory as a file.
 *
 * Only equality and containment are reported, which is the contradiction no artifact set could resolve: one
 * declaration wants a file where another wants a directory. A host that merely sits inside a root is not one -- a
 * directory layout rooted at `skills` claims `skills/<name>/<entryFile>` and never a file directly beneath it -- and a
 * root at the empty string is the target root itself, which every host is under and no host contradicts.
 *
 * A host whose shape a tree layout's claim rule could match, such as one at the target root under a file layout rooted
 * there, is not decidable from declarations: whether it matches depends on the slugs a catalog turns out to carry. The
 * scan that reads current target state excludes declared hosts instead.
 */
function collectHostCollisions(
  host: string,
  layoutRoots: ReadonlyArray<string>,
  path: string,
  violations: Array<Violation>,
): void {
  for (const root of layoutRoots) {
    if (host === root || host.startsWith(`${root}/`) || root.startsWith(`${host}/`)) {
      violations.push({ path, message: `collides with the layout root "${root}", which is a directory` });
    }
  }
}

/** Reports markers that could not delimit a span at all, restating the reason as a located violation. */
function collectMarkerFaults(markers: MarkerPair, path: string, violations: Array<Violation>): void {
  try {
    assertMarkersAreUsable(markers);
  } catch (error: unknown) {
    violations.push({ path, message: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Reports a contribution marker template that does not stand its contributor exactly once.
 *
 * Once, not at least once: the template renders to one pattern carrying one capture group, and a second placeholder
 * would leave the reader a choice of which capture named the contributor.
 */
function collectPlaceholderFaults(template: MarkerPair, path: string, violations: Array<Violation>): void {
  for (const [role, value] of [
    ['open', template.open],
    ['close', template.close],
  ] as const) {
    const count = value.split(ARTIFACT_ID_PLACEHOLDER).length - 1;
    if (count !== 1) {
      violations.push({
        path: `${path}.${role}`,
        message: `stands ${ARTIFACT_ID_PLACEHOLDER} ${count} times, but exactly one names the contributor`,
      });
    }
  }
}

/** Reports each value `names` carries twice, appending to `violations` in the order the repeats first appear. */
function collectRepeats(names: ReadonlyArray<string>, path: string, verb: string, violations: Array<Violation>): void {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) {
      repeated.add(name);
    }
    seen.add(name);
  }
  for (const name of repeated) {
    violations.push({ path, message: `${verb} "${name}" more than once` });
  }
}

// endregion | Helpers
