import { describe, expect, it, vi } from 'vitest';

import { collectIds } from '../../../consistency/collectIds.ts';
import { AMBIENT_DEPLOYMENT, CLAUDE_TARGET, SAMPLE_KINDS } from '../../test-utils/sample-render-targets.ts';
import { findDeploymentFaults } from '../findDeploymentFaults.ts';

const defect = new Error('defect inside the marker validator');

vi.mock(import('../../../ownership/region-matching.ts'), async (importOriginal) => ({
  ...(await importOriginal()),
  findMarkerFault: () => {
    throw defect;
  },
}));

describe(findDeploymentFaults, () => {
  it('lets a defect thrown inside the marker validator propagate rather than reporting it as a violation', () => {
    const target = { ...CLAUDE_TARGET, deployments: [AMBIENT_DEPLOYMENT] };

    expect(() => findDeploymentFaults(target, 'targets[0]', collectIds(SAMPLE_KINDS))).toThrow(defect);
  });
});
