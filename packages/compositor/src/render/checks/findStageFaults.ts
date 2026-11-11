import { countCaptureGroups } from '../../consistency/countCaptureGroups.ts';
import type { Violation } from '../../consistency/Violation.ts';
import { ARTIFACT_ID_PLACEHOLDER } from '../../deployment/contribution-markers.ts';
import { INLAY_NAME_PLACEHOLDER } from '../../inlays/inlay-markers.ts';
import type { RenderTarget } from '../../schemas/render-target-schemas.ts';
import { findMarkerFaults } from './findMarkerFaults.ts';
import { findPlaceholderFaults } from './findPlaceholderFaults.ts';

/**
 * Reports a link grammar that does not compile or does not capture exactly one group, and an inlay stage whose two
 * marker templates could not delimit a span and name what they stand for, or whose reshape rule does not compile.
 */
export function findStageFaults(target: RenderTarget, at: string): Array<Violation> {
  const violations: Array<Violation> = [];

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
    violations.push(
      ...findMarkerFaults(stage.markers, `${stageAt}.markers`),
      ...findPlaceholderFaults(stage.markers, INLAY_NAME_PLACEHOLDER, 'inlay', `${stageAt}.markers`),
      ...findMarkerFaults(stage.contributionMarkers, `${stageAt}.contributionMarkers`),
      ...findPlaceholderFaults(
        stage.contributionMarkers,
        ARTIFACT_ID_PLACEHOLDER,
        'contributor',
        `${stageAt}.contributionMarkers`,
      ),
    );
    if (stage.reshape !== undefined && countCaptureGroups(stage.reshape.pattern) === undefined) {
      violations.push({ path: `${stageAt}.reshape.pattern`, message: 'is not a valid regular expression' });
    }
  }

  return violations;
}
