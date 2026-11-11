import { describe, expect, it } from 'vitest';

import { collectIds } from '../../../consistency/collectIds.ts';
import { ARTIFACT_ID_PLACEHOLDER } from '../../../deployment/contribution-markers.ts';
import type { RenderTarget } from '../../../schemas/render-target-schemas.ts';
import {
  AMBIENT_DEPLOYMENT,
  CLAUDE_TARGET,
  SAMPLE_KINDS,
  SKILL_DEPLOYMENT,
} from '../../test-utils/sample-render-targets.ts';
import { findDeploymentFaults } from '../findDeploymentFaults.ts';

const kindIds = collectIds(SAMPLE_KINDS);

describe(findDeploymentFaults, () => {
  it('accepts a tree deployment and a region deployment that can each do their jobs', () => {
    const target: RenderTarget = { ...CLAUDE_TARGET, deployments: [SKILL_DEPLOYMENT, AMBIENT_DEPLOYMENT] };

    expect(findDeploymentFaults(target, 'targets[0]', kindIds)).toStrictEqual([]);
  });

  it('reports a deployment naming a kind no descriptor declares', () => {
    const unknown: RenderTarget = { ...CLAUDE_TARGET, deployments: [{ ...SKILL_DEPLOYMENT, kindId: 'subagent' }] };

    expect(findDeploymentFaults(unknown, 'targets[0]', kindIds)).toStrictEqual([
      { path: 'targets[0].deployments[0].kindId', message: 'references "subagent", which is not an entry in kinds' },
    ]);
  });

  it('accepts a name template standing its placeholder, wherever in the name it stands', () => {
    const templated: RenderTarget = {
      ...CLAUDE_TARGET,
      deployments: [{ ...SKILL_DEPLOYMENT, nameTemplate: 'consult-{slug}' }],
    };

    expect(findDeploymentFaults(templated, 'targets[0]', kindIds)).toStrictEqual([]);
  });

  it('reports a name template standing no placeholder, which deploys one name for every artifact', () => {
    const fixed: RenderTarget = { ...CLAUDE_TARGET, deployments: [{ ...SKILL_DEPLOYMENT, nameTemplate: 'guidance' }] };

    expect(findDeploymentFaults(fixed, 'targets[0]', kindIds)).toStrictEqual([
      {
        path: 'targets[0].deployments[0].nameTemplate',
        message: 'stands no {slug}, so no name it renders recovers the artifact that deployed it',
      },
    ]);
  });

  it.each([
    ['a dot', '.{slug}'],
    ['an underscore', '_shared-{slug}'],
  ])(
    'reports a name template leading with %s, which a destination scan reads as support content',
    (_label, nameTemplate) => {
      const hidden: RenderTarget = { ...CLAUDE_TARGET, deployments: [{ ...SKILL_DEPLOYMENT, nameTemplate }] };

      expect(findDeploymentFaults(hidden, 'targets[0]', kindIds)).toStrictEqual([
        {
          path: 'targets[0].deployments[0].nameTemplate',
          message: 'renders a support-prefixed name, which a destination scan passes over',
        },
      ]);
    },
  );

  it('accepts two kinds aggregating into one host, which their own markers keep apart', () => {
    const shared: RenderTarget = {
      ...CLAUDE_TARGET,
      deployments: [AMBIENT_DEPLOYMENT, { ...AMBIENT_DEPLOYMENT, kindId: 'skill' }],
    };

    expect(findDeploymentFaults(shared, 'targets[0]', kindIds)).toStrictEqual([]);
  });

  it.each([
    ['markers', { open: '<!-- codeassembly -->', close: '<!-- codeassembly -->' }, 'markers'],
    ['contribution markers', { open: '{artifactId}', close: '{artifactId}' }, 'contributionMarkers'],
  ])('reports %s that could not delimit a span', (_label, pair, field) => {
    const wrong: RenderTarget = { ...CLAUDE_TARGET, deployments: [{ ...AMBIENT_DEPLOYMENT, [field]: pair }] };

    expect(findDeploymentFaults(wrong, 'targets[0]', kindIds).map(({ path }) => path)).toStrictEqual([
      `targets[0].deployments[0].${field}`,
    ]);
  });

  it('reports a contribution marker template that does not stand its contributor once', () => {
    const contributionMarkers = { open: '<!-- rulebook -->', close: '<!-- /{artifactId} -->' };
    const wrong: RenderTarget = { ...CLAUDE_TARGET, deployments: [{ ...AMBIENT_DEPLOYMENT, contributionMarkers }] };

    expect(findDeploymentFaults(wrong, 'targets[0]', kindIds)).toStrictEqual([
      {
        path: 'targets[0].deployments[0].contributionMarkers.open',
        message: `stands ${ARTIFACT_ID_PLACEHOLDER} 0 times, but exactly one names the contributor`,
      },
    ]);
  });

  it('reports a host standing where a layout root goes', () => {
    const collided: RenderTarget = {
      ...CLAUDE_TARGET,
      deployments: [SKILL_DEPLOYMENT, { ...AMBIENT_DEPLOYMENT, host: 'skills' }],
    };

    expect(findDeploymentFaults(collided, 'targets[0]', kindIds)).toStrictEqual([
      {
        path: 'targets[0].deployments[1].host',
        message: 'collides with the layout root "skills", which needs a directory where this host is a file',
      },
    ]);
  });

  it("reports a region deployment's faults in the order markers, contribution markers, contributors, host", () => {
    const wrong: RenderTarget = {
      ...CLAUDE_TARGET,
      deployments: [
        SKILL_DEPLOYMENT,
        {
          ...AMBIENT_DEPLOYMENT,
          kindId: 'subagent',
          host: 'skills',
          markers: { open: ' ', close: '<!-- /x -->' },
          contributionMarkers: { open: '<!-- x -->', close: '<!-- x -->' },
        },
      ],
    };

    expect(findDeploymentFaults(wrong, 'targets[0]', kindIds).map(({ path }) => path)).toStrictEqual([
      'targets[0].deployments[1].kindId',
      'targets[0].deployments[1].markers',
      'targets[0].deployments[1].contributionMarkers',
      'targets[0].deployments[1].contributionMarkers.open',
      'targets[0].deployments[1].contributionMarkers.close',
      'targets[0].deployments[1].host',
    ]);
  });
});
