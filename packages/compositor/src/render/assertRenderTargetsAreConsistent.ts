import { describeError } from '@williamthorsen/toolbelt.errors';

import { collectIds } from '../consistency/collectIds.ts';
import { ConsistencyError } from '../consistency/ConsistencyError.ts';
import { countCaptureGroups } from '../consistency/countCaptureGroups.ts';
import { createRequireKnown } from '../consistency/createRequireKnown.ts';
import { findDuplicateIds } from '../consistency/findDuplicateIds.ts';
import type { Violation } from '../consistency/Violation.ts';
import { ARTIFACT_ID_PLACEHOLDER } from '../deployment/contribution-markers.ts';
import { SLUG_PLACEHOLDER } from '../deployment/name-templates.ts';
import { INLAY_NAME_PLACEHOLDER } from '../inlays/inlay-markers.ts';
import { assertMarkersAreUsable } from '../ownership/region-matching.ts';
import { allowsStamping, carriesSentinel, stampSentinel } from '../ownership/structured/sentinel.ts';
import { namesAnArtifact } from '../resolution/namesAnArtifact.ts';
import type { KindDescriptor } from '../schemas/descriptor-schemas.ts';
import type { OwnedItemsDeclaration } from '../schemas/owned-items-schemas.ts';
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
 * every deployment names a kind in `kinds`, that a region deployment's markers and host can do their jobs, that each
 * link grammar compiles and captures exactly one group, that an inlay stage's two marker templates can delimit a span
 * and name what they stand for with a reshape rule that compiles, and that no owned-items declaration contends for a
 * collection another already owns or nests inside, disagrees with a sibling about its host's format, sits on a region
 * host, or carries an item its sentinel could never write or find again.
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
        collectNameTemplateFaults(deployment.nameTemplate, `${at}.deployments[${position}].nameTemplate`, violations);
        continue;
      }
      const deployedAt = `${at}.deployments[${position}]`;
      collectMarkerFaults(deployment.markers, `${deployedAt}.markers`, violations);
      collectMarkerFaults(deployment.contributionMarkers, `${deployedAt}.contributionMarkers`, violations);
      collectContributorFaults(deployment.contributionMarkers, `${deployedAt}.contributionMarkers`, violations);
      collectHostCollisions(deployment.host, layoutRoots, `${deployedAt}.host`, violations);
    }

    const regionHosts = new Set(
      target.deployments.filter((deployment) => deployment.form === 'region').map((deployment) => deployment.host),
    );
    const ownedItems = target.ownedItems ?? [];
    collectRepeats(
      ownedItems.map((declaration) => `${declaration.host} at ${declaration.collection.join('.')}`),
      `${at}.ownedItems`,
      'owns',
      violations,
    );

    const formatsByHost = new Map<string, string>();
    for (const [position, declaration] of ownedItems.entries()) {
      const ownedAt = `${at}.ownedItems[${position}]`;
      collectHostCollisions(declaration.host, layoutRoots, `${ownedAt}.host`, violations);
      collectNestedCollections(declaration, ownedItems.slice(0, position), ownedAt, violations);
      const declaredFormat = formatsByHost.get(declaration.host);
      if (declaredFormat === undefined) {
        formatsByHost.set(declaration.host, declaration.format);
      } else if (declaredFormat !== declaration.format) {
        violations.push({
          path: `${ownedAt}.format`,
          message: `is "${declaration.format}" where the same host is declared "${declaredFormat}", and a file has one`,
        });
      }
      if (regionHosts.has(declaration.host)) {
        violations.push({
          path: `${ownedAt}.host`,
          message: 'is also a region host, so two mechanisms would each compute the whole file',
        });
      }
      collectUnmarkableItems(declaration, ownedAt, violations);
    }

    for (const [position, stage] of target.stages.entries()) {
      const stageAt = `${at}.stages[${position}]`;

      if (stage.kind === 'links') {
        const groups = countCaptureGroups(stage.pattern);
        const path = `${stageAt}.pattern`;
        if (groups === undefined) {
          violations.push({ path, message: 'is not a valid regular expression' });
        } else if (groups !== 1) {
          violations.push({ path, message: `captures ${groups} groups, but exactly one names the link target` });
        }
        continue;
      }

      if (stage.kind !== 'inlay') {
        continue;
      }
      collectMarkerFaults(stage.markers, `${stageAt}.markers`, violations);
      collectInlayNameFaults(stage.markers, `${stageAt}.markers`, violations);
      collectMarkerFaults(stage.contributionMarkers, `${stageAt}.contributionMarkers`, violations);
      collectContributorFaults(stage.contributionMarkers, `${stageAt}.contributionMarkers`, violations);
      if (stage.reshape !== undefined && countCaptureGroups(stage.reshape.pattern) === undefined) {
        violations.push({ path: `${stageAt}.reshape.pattern`, message: 'is not a valid regular expression' });
      }
    }
  }

  if (violations.length > 0) {
    throw new RenderTargetConsistencyError(violations);
  }
}

// region | Helpers

/**
 * Reports a host declared where a tree layout needs a directory.
 *
 * That is the one contradiction no artifact set could resolve, and it holds two ways: the host stands at a root
 * itself, or it stands at a directory some root is nested inside. A host merely sitting inside a root is not one, a
 * directory layout rooted at `skills` claiming `skills/<name>/<entryFile>` and never a file directly beneath it. A root
 * at the empty string is the target root, which every host is under and no host contradicts.
 *
 * A host whose shape a tree layout's claim rule could match, such as one at the target root under a file layout rooted
 * there, is decidable only against the slugs a catalog turns out to carry. The scan that reads current target state
 * excludes declared hosts instead.
 */
function collectHostCollisions(
  host: string,
  layoutRoots: ReadonlyArray<string>,
  path: string,
  violations: Array<Violation>,
): void {
  for (const root of layoutRoots) {
    if (host === root || root.startsWith(`${host}/`)) {
      violations.push({
        path,
        message: `collides with the layout root "${root}", which needs a directory where this host is a file`,
      });
    }
  }
}

/**
 * Reports a declared collection path that nests inside one an earlier declaration on the same host already owns.
 *
 * A collection is an array, and no key descends through an array, so a path and a prefix of it cannot both name one.
 * The fold runs the outer declaration first and the inner one then refuses; on a host the target does not yet hold,
 * that refusal produces no entry at all, nothing standing there for it to be recorded on.
 */
function collectNestedCollections(
  declaration: OwnedItemsDeclaration,
  earlier: ReadonlyArray<OwnedItemsDeclaration>,
  path: string,
  violations: Array<Violation>,
): void {
  for (const other of earlier) {
    if (other.host === declaration.host && nestsWithin(declaration.collection, other.collection)) {
      violations.push({
        path: `${path}.collection`,
        message: `nests with "${other.collection.join('.')}" on the same host, and no key descends through a collection`,
      });
      return;
    }
  }
}

/**
 * Reports a declared item the declaration's own sentinel could never reach.
 *
 * The two branches fault differently and both are decidable from the declaration alone. A sentinel the engine cannot
 * write needs the item to carry the mark already, so one that does not could never be found again. A sentinel it can
 * write needs somewhere to write it, and an item that is not a mapping the path descends through offers none. Catching
 * both here turns what would otherwise throw at the first host the declaration was run over into a located authoring
 * fault, reported beside every other mistake in the declarations.
 */
function collectUnmarkableItems(declaration: OwnedItemsDeclaration, path: string, violations: Array<Violation>): void {
  const stamps = allowsStamping(declaration.sentinel);

  for (const [position, item] of declaration.items.entries()) {
    const at = `${path}.items[${position}]`;
    if (!stamps) {
      if (!carriesSentinel(item, declaration.sentinel)) {
        violations.push({
          path: at,
          message: 'does not have the sentinel, which this declaration cannot write, so it could never be found again',
        });
      }
      continue;
    }
    try {
      stampSentinel(item, declaration.sentinel);
    } catch (error: unknown) {
      violations.push({ path: at, message: describeError(error) });
    }
  }
}

/** Reports markers that could not delimit a span at all, restating the reason as a located violation. */
function collectMarkerFaults(markers: MarkerPair, path: string, violations: Array<Violation>): void {
  try {
    assertMarkersAreUsable(markers);
  } catch (error: unknown) {
    violations.push({ path, message: describeError(error) });
  }
}

/**
 * Reports a name template rendering names no scan of the destination could claim back.
 *
 * A template standing no placeholder renders one name for every artifact of its kind, and no such name recovers the
 * artifact that deployed it. A literal head beginning with a dot or an underscore renders support content, which a
 * destination scan passes over on the rule a source is enumerated by. Either deploys files that are never diffed, never
 * reported as drifted, and never removed, which is the silent kind of fault this pass exists to make loud.
 *
 * A template leading with its placeholder needs no check, a slug carrying such a prefix never being enumerated.
 */
function collectNameTemplateFaults(template: string | undefined, path: string, violations: Array<Violation>): void {
  if (template === undefined) {
    return;
  }

  const [head = ''] = template.split(SLUG_PLACEHOLDER);
  if (!template.includes(SLUG_PLACEHOLDER)) {
    violations.push({
      path,
      message: `stands no ${SLUG_PLACEHOLDER}, so no name it renders recovers the artifact that deployed it`,
    });
  } else if (!namesAnArtifact(head)) {
    violations.push({ path, message: 'renders a support-prefixed name, which a destination scan passes over' });
  }
}

/**
 * Reports a contribution marker template that does not stand its contributor exactly once.
 *
 * Once, not at least once: the template renders to one pattern carrying one capture group, and a second placeholder
 * would leave the reader a choice of which capture named the contributor.
 */
function collectContributorFaults(template: MarkerPair, path: string, violations: Array<Violation>): void {
  collectPlaceholderFaults(template, ARTIFACT_ID_PLACEHOLDER, 'contributor', path, violations);
}

/**
 * Reports an inlay marker template that does not stand its inlay exactly once.
 *
 * A filled inlay is attributed from the deployed file alone, so a marker naming no inlay leaves a reader unable to say
 * which one the span belongs to, and one naming two leaves the attribution ambiguous.
 */
function collectInlayNameFaults(template: MarkerPair, path: string, violations: Array<Violation>): void {
  collectPlaceholderFaults(template, INLAY_NAME_PLACEHOLDER, 'inlay', path, violations);
}

/** Reports each side of a marker template that does not stand `placeholder`, standing for `subject`, exactly once. */
function collectPlaceholderFaults(
  template: MarkerPair,
  placeholder: string,
  subject: string,
  path: string,
  violations: Array<Violation>,
): void {
  for (const [role, value] of [
    ['open', template.open],
    ['close', template.close],
  ] as const) {
    const count = value.split(placeholder).length - 1;
    if (count !== 1) {
      violations.push({
        path: `${path}.${role}`,
        message: `stands ${placeholder} ${count} times, but exactly one names the ${subject}`,
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

/**
 * Reports whether either path is a strict prefix of the other, the two then naming a collection and something inside it.
 *
 * Two identical paths are the repeat check's, so they read as no nesting here and one fault reports one message.
 */
function nestsWithin(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
  if (left.length === right.length) {
    return false;
  }
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

// endregion | Helpers
