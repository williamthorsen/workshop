import { captureError } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import type { RenderTarget } from '../../schemas/render-target-schemas.ts';
import {
  assertRenderTargetsAreConsistent,
  RenderTargetConsistencyError,
  type RenderTargetViolation,
} from '../assertRenderTargetsAreConsistent.ts';
import {
  AMBIENT_DEPLOYMENT,
  CLAUDE_TARGET,
  SAMPLE_KINDS,
  SETTINGS_HOOKS,
  SKILL_DEPLOYMENT,
} from '../test-utils/sample-render-targets.ts';

describe(assertRenderTargetsAreConsistent, () => {
  it('accepts a consistent set of declarations', () => {
    expect(() => assertRenderTargetsAreConsistent([CLAUDE_TARGET], SAMPLE_KINDS)).not.toThrow();
  });

  it('reports two targets sharing an id', async () => {
    await expect(violationsOf([CLAUDE_TARGET, CLAUDE_TARGET])).resolves.toStrictEqual([
      { path: 'targets', message: expect.stringContaining('"claude"') },
    ]);
  });

  it('reports every violation in one run, rather than the first', async () => {
    const broken: RenderTarget = {
      ...CLAUDE_TARGET,
      deployments: [{ ...SKILL_DEPLOYMENT, kindId: 'subagent' }],
      stages: [{ kind: 'tokens' }, { kind: 'tokens' }, { kind: 'links', pattern: '(a)(b)' }],
    };

    expect((await violationsOf([broken])).map(({ path }) => path)).toStrictEqual([
      'targets[0].stages',
      'targets[0].deployments[0].kindId',
      'targets[0].stages[2].pattern',
    ]);
  });

  it('reports each target in turn, and within one its repeats, deployments, owned items, then stages', async () => {
    const faulty = (id: string): RenderTarget => ({
      ...CLAUDE_TARGET,
      id,
      deployments: [SKILL_DEPLOYMENT, { ...AMBIENT_DEPLOYMENT, host: 'skills' }],
      ownedItems: [{ ...SETTINGS_HOOKS, host: 'skills' }],
      stages: [{ kind: 'tokens' }, { kind: 'tokens' }, { kind: 'links', pattern: '(' }],
    });

    expect((await violationsOf([faulty('claude'), faulty('codex')])).map(({ path }) => path)).toStrictEqual([
      'targets[0].stages',
      'targets[0].deployments[1].host',
      'targets[0].ownedItems[0].host',
      'targets[0].ownedItems[0].host',
      'targets[0].stages[2].pattern',
      'targets[1].stages',
      'targets[1].deployments[1].host',
      'targets[1].ownedItems[0].host',
      'targets[1].ownedItems[0].host',
      'targets[1].stages[2].pattern',
    ]);
  });
});

// region | Helpers

/** Runs the assertion and reads back the violations it raised, failing the test if it raised none. */
async function violationsOf(targets: ReadonlyArray<RenderTarget>): Promise<ReadonlyArray<RenderTargetViolation>> {
  return (
    await captureError(RenderTargetConsistencyError, () => assertRenderTargetsAreConsistent(targets, SAMPLE_KINDS))
  ).violations;
}

// endregion | Helpers
