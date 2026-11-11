import { createRequireKnown } from '../../consistency/createRequireKnown.ts';
import type { Violation } from '../../consistency/Violation.ts';
import { ARTIFACT_ID_PLACEHOLDER } from '../../deployment/contribution-markers.ts';
import { SLUG_PLACEHOLDER } from '../../deployment/name-templates.ts';
import { namesAnArtifact } from '../../resolution/namesAnArtifact.ts';
import type { RenderTarget } from '../../schemas/render-target-schemas.ts';
import { findHostCollisions } from './findHostCollisions.ts';
import { findMarkerFaults } from './findMarkerFaults.ts';
import { findPlaceholderFaults } from './findPlaceholderFaults.ts';

/**
 * Reports a deployment naming a kind not in `kindIds`, a tree deployment's name template that no destination scan
 * could claim back, and a region deployment whose markers or host could not do their jobs.
 */
export function findDeploymentFaults(target: RenderTarget, at: string, kindIds: ReadonlySet<string>): Array<Violation> {
  const violations: Array<Violation> = [];
  const requireKnown = createRequireKnown(violations);

  for (const [position, deployment] of target.deployments.entries()) {
    const deployedAt = `${at}.deployments[${position}]`;
    requireKnown(kindIds, deployment.kindId, `${deployedAt}.kindId`, 'kinds');
    if (deployment.form !== 'region') {
      violations.push(...findNameTemplateFaults(deployment.nameTemplate, `${deployedAt}.nameTemplate`));
      continue;
    }
    violations.push(
      ...findMarkerFaults(deployment.markers, `${deployedAt}.markers`),
      ...findMarkerFaults(deployment.contributionMarkers, `${deployedAt}.contributionMarkers`),
      ...findPlaceholderFaults(
        deployment.contributionMarkers,
        ARTIFACT_ID_PLACEHOLDER,
        'contributor',
        `${deployedAt}.contributionMarkers`,
      ),
      ...findHostCollisions(deployment.host, target.deployments, `${deployedAt}.host`),
    );
  }

  return violations;
}

// region | Helpers

/**
 * Reports a name template rendering names no scan of the destination could claim back.
 *
 * A template standing no placeholder renders one name for every artifact of its kind, and no such name recovers the
 * artifact that deployed it. A literal head beginning with a dot or an underscore renders support content, which a
 * destination scan passes over on the rule a source is enumerated by. Either deploys files that are never diffed, never
 * reported as drifted, and never removed, which is the silent kind of fault this pass exists to make loud.
 *
 * A template leading with its placeholder needs no check, a slug with such a prefix never being enumerated.
 */
function findNameTemplateFaults(template: string | undefined, path: string): Array<Violation> {
  if (template === undefined) {
    return [];
  }

  const [head = ''] = template.split(SLUG_PLACEHOLDER);
  if (!template.includes(SLUG_PLACEHOLDER)) {
    return [
      { path, message: `stands no ${SLUG_PLACEHOLDER}, so no name it renders recovers the artifact that deployed it` },
    ];
  }
  if (!namesAnArtifact(head)) {
    return [{ path, message: 'renders a support-prefixed name, which a destination scan passes over' }];
  }
  return [];
}

// endregion | Helpers
