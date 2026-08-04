import { describe, expect, it } from 'vitest';

import type { KindDescriptor } from '../../schemas/descriptor-schemas.ts';
import type { RenderTarget } from '../../schemas/render-target-schemas.ts';
import type { RenderTargetViolation } from '../assertRenderTargetsAreConsistent.ts';
import { assertRenderTargetsAreConsistent, RenderTargetConsistencyError } from '../assertRenderTargetsAreConsistent.ts';

const kinds: ReadonlyArray<KindDescriptor> = [
  { id: 'rulebook', label: 'Rulebook', emitsFiles: true },
  { id: 'skill', label: 'Skill', emitsFiles: true },
];

const skillDeployment = {
  kindId: 'skill',
  layout: { form: 'directory', root: 'skills', entryFile: 'SKILL.md' },
} as const;

const claude: RenderTarget = {
  id: 'claude',
  label: 'Claude',
  root: '~/.claude',
  tokenMappings: [],
  deployments: [skillDeployment],
  stages: [{ kind: 'tokens' }, { kind: 'links', pattern: String.raw`\[[^\]]*\]\(([^)]+)\)` }],
};

describe(assertRenderTargetsAreConsistent, () => {
  it('accepts a consistent set of declarations', () => {
    expect(() => assertRenderTargetsAreConsistent([claude], kinds)).not.toThrow();
  });

  it('reports a target that repeats a stage kind', () => {
    const repeated: RenderTarget = { ...claude, stages: [{ kind: 'tokens' }, { kind: 'tokens' }] };

    expect(violationsOf([repeated])).toStrictEqual([
      { path: 'targets[0].stages', message: 'runs "tokens" more than once' },
    ]);
  });

  it('reports a target that deploys one kind twice', () => {
    const repeated: RenderTarget = { ...claude, deployments: [skillDeployment, skillDeployment] };

    expect(violationsOf([repeated])).toStrictEqual([
      { path: 'targets[0].deployments', message: 'deploys "skill" more than once' },
    ]);
  });

  it('reports a deployment naming a kind no descriptor carries', () => {
    const unknown: RenderTarget = {
      ...claude,
      deployments: [{ ...skillDeployment, kindId: 'subagent' }],
    };

    expect(violationsOf([unknown])).toStrictEqual([
      {
        path: 'targets[0].deployments[0].kindId',
        message: 'references "subagent", which is not an entry in kinds',
      },
    ]);
  });

  it('reports a link grammar that does not compile', () => {
    const broken: RenderTarget = { ...claude, stages: [{ kind: 'links', pattern: '([a-z' }] };

    expect(violationsOf([broken])).toStrictEqual([
      { path: 'targets[0].stages[0].pattern', message: 'is not a valid regular expression' },
    ]);
  });

  it.each([
    ['captures nothing to rewrite', String.raw`\[[^\]]*\]\([^)]+\)`, 0],
    ['leaves the engine a choice of captures', String.raw`\[([^\]]*)\]\(([^)]+)\)`, 2],
  ])('reports a link grammar that %s', (_label, pattern, groups) => {
    const wrong: RenderTarget = { ...claude, stages: [{ kind: 'links', pattern }] };

    expect(violationsOf([wrong])).toStrictEqual([
      {
        path: 'targets[0].stages[0].pattern',
        message: `captures ${groups} groups, but exactly one names the link target`,
      },
    ]);
  });

  it('reports two targets sharing an id', () => {
    expect(violationsOf([claude, claude])).toStrictEqual([
      { path: 'targets', message: 'carries "claude" more than once' },
    ]);
  });

  it('reports every violation in one run, rather than the first', () => {
    const broken: RenderTarget = {
      ...claude,
      deployments: [{ ...skillDeployment, kindId: 'subagent' }],
      stages: [{ kind: 'tokens' }, { kind: 'tokens' }, { kind: 'links', pattern: '(a)(b)' }],
    };

    expect(violationsOf([broken]).map(({ path }) => path)).toStrictEqual([
      'targets[0].stages',
      'targets[0].deployments[0].kindId',
      'targets[0].stages[2].pattern',
    ]);
  });
});

// region | Helpers

/** Runs the assertion and reads back the violations it raised, failing the test if it raised none. */
function violationsOf(targets: ReadonlyArray<RenderTarget>): ReadonlyArray<RenderTargetViolation> {
  try {
    assertRenderTargetsAreConsistent(targets, kinds);
  } catch (error) {
    if (error instanceof RenderTargetConsistencyError) {
      return error.violations;
    }
    throw error;
  }
  throw new Error('Expected the declarations to be reported as inconsistent.');
}

// endregion | Helpers
