import { describe, expect, it } from 'vitest';

import type { RenderTarget } from '../../../schemas/render-target-schemas.ts';
import { AMBIENT_DEPLOYMENT, CLAUDE_TARGET, SKILL_DEPLOYMENT } from '../../test-utils/sample-render-targets.ts';
import { findRepeatedDeclarations } from '../findRepeatedDeclarations.ts';

describe(findRepeatedDeclarations, () => {
  it('accepts a target declaring each deployed kind and stage kind once', () => {
    expect(findRepeatedDeclarations(CLAUDE_TARGET, 'targets[0]')).toStrictEqual([]);
  });

  it('reports a target that repeats a stage kind', () => {
    const repeated: RenderTarget = { ...CLAUDE_TARGET, stages: [{ kind: 'tokens' }, { kind: 'tokens' }] };

    expect(findRepeatedDeclarations(repeated, 'targets[0]')).toStrictEqual([
      { path: 'targets[0].stages', message: expect.stringContaining('"tokens"') },
    ]);
  });

  it('reports a target that deploys one kind twice', () => {
    const repeated: RenderTarget = { ...CLAUDE_TARGET, deployments: [SKILL_DEPLOYMENT, SKILL_DEPLOYMENT] };

    expect(findRepeatedDeclarations(repeated, 'targets[0]')).toStrictEqual([
      { path: 'targets[0].deployments', message: expect.stringContaining('"skill"') },
    ]);
  });

  it('reports a kind deployed once as a tree and once into a host', () => {
    const both: RenderTarget = {
      ...CLAUDE_TARGET,
      deployments: [SKILL_DEPLOYMENT, { ...AMBIENT_DEPLOYMENT, kindId: 'skill' }],
    };

    expect(findRepeatedDeclarations(both, 'targets[0]')).toStrictEqual([
      { path: 'targets[0].deployments', message: expect.stringContaining('"skill"') },
    ]);
  });

  it('reports repeated deployments before repeated stages', () => {
    const repeated: RenderTarget = {
      ...CLAUDE_TARGET,
      deployments: [SKILL_DEPLOYMENT, SKILL_DEPLOYMENT],
      stages: [{ kind: 'tokens' }, { kind: 'tokens' }],
    };

    expect(findRepeatedDeclarations(repeated, 'targets[0]').map(({ path }) => path)).toStrictEqual([
      'targets[0].deployments',
      'targets[0].stages',
    ]);
  });
});
