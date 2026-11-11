import type { Violation } from '../../consistency/Violation.ts';
import type { RenderTarget } from '../../schemas/render-target-schemas.ts';
import { findRepeats } from './findRepeats.ts';

/**
 * Reports a target that deploys one kind twice or runs one stage kind twice.
 *
 * A stage declared twice would run twice, and a kind deployed twice would put one artifact in two places; both are
 * authoring mistakes a declaration can express and no render could act on.
 */
export function findRepeatedDeclarations(target: RenderTarget, at: string): Array<Violation> {
  return [
    ...findRepeats(
      target.deployments.map((deployment) => deployment.kindId),
      `${at}.deployments`,
      'deploys',
    ),
    ...findRepeats(
      target.stages.map((stage) => stage.kind),
      `${at}.stages`,
      'runs',
    ),
  ];
}
