import { describe, expect, it } from 'vitest';

import { ARTIFACT_ID_PLACEHOLDER } from '../../deployment/contribution-markers.ts';
import type { KindDescriptor } from '../../schemas/descriptor-schemas.ts';
import type { RenderTarget } from '../../schemas/render-target-schemas.ts';
import type { RenderTargetViolation } from '../assertRenderTargetsAreConsistent.ts';
import { assertRenderTargetsAreConsistent, RenderTargetConsistencyError } from '../assertRenderTargetsAreConsistent.ts';

const kinds: ReadonlyArray<KindDescriptor> = [
  { id: 'rulebook', label: 'Rulebook', emitsFiles: true },
  { id: 'skill', label: 'Skill', emitsFiles: true },
];

const skillDeployment = {
  form: 'tree',
  kindId: 'skill',
  layout: { form: 'directory', root: 'skills', entryFile: 'SKILL.md' },
} as const;

const ambientDeployment = {
  form: 'region',
  kindId: 'rulebook',
  host: 'CLAUDE.md',
  markers: { open: '<!-- codeassembly -->', close: '<!-- /codeassembly -->' },
  contributionMarkers: { open: '<!-- {artifactId} -->', close: '<!-- /{artifactId} -->' },
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

  it('accepts a name template standing its placeholder, wherever in the name it stands', () => {
    const templated: RenderTarget = {
      ...claude,
      deployments: [{ ...skillDeployment, nameTemplate: 'consult-{slug}' }],
    };

    expect(() => assertRenderTargetsAreConsistent([templated], kinds)).not.toThrow();
  });

  it('reports a name template standing no placeholder, which deploys one name for every artifact', () => {
    const fixed: RenderTarget = { ...claude, deployments: [{ ...skillDeployment, nameTemplate: 'guidance' }] };

    expect(violationsOf([fixed])).toStrictEqual([
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
      const hidden: RenderTarget = { ...claude, deployments: [{ ...skillDeployment, nameTemplate }] };

      expect(violationsOf([hidden])).toStrictEqual([
        {
          path: 'targets[0].deployments[0].nameTemplate',
          message: 'renders a support-prefixed name, which a destination scan passes over',
        },
      ]);
    },
  );

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

  it('reports a kind deployed once as a tree and once into a host', () => {
    const both: RenderTarget = { ...claude, deployments: [skillDeployment, { ...ambientDeployment, kindId: 'skill' }] };

    expect(violationsOf([both])).toStrictEqual([
      { path: 'targets[0].deployments', message: 'deploys "skill" more than once' },
    ]);
  });

  it('accepts two kinds aggregating into one host, which their own markers keep apart', () => {
    const shared: RenderTarget = {
      ...claude,
      deployments: [ambientDeployment, { ...ambientDeployment, kindId: 'skill' }],
    };

    expect(() => assertRenderTargetsAreConsistent([shared], kinds)).not.toThrow();
  });

  it('reports a host standing where a layout root goes', () => {
    const collided: RenderTarget = {
      ...claude,
      deployments: [skillDeployment, { ...ambientDeployment, host: 'skills' }],
    };

    expect(violationsOf([collided])).toStrictEqual([
      {
        path: 'targets[0].deployments[1].host',
        message: 'collides with the layout root "skills", which needs a directory where this host is a file',
      },
    ]);
  });

  it('reports a host standing at a directory a layout root is nested inside', () => {
    const nested = {
      form: 'tree',
      kindId: 'skill',
      layout: { form: 'directory', root: 'agents/skills', entryFile: 'SKILL.md' },
    } as const;
    const collided: RenderTarget = { ...claude, deployments: [nested, { ...ambientDeployment, host: 'agents' }] };

    expect(violationsOf([collided])).toStrictEqual([
      {
        path: 'targets[0].deployments[1].host',
        message: 'collides with the layout root "agents/skills", which needs a directory where this host is a file',
      },
    ]);
  });

  // A directory layout claims `skills/<name>/<entryFile>` and never a file directly beneath its root, so a host there
  // contradicts nothing.
  it('accepts a host sitting inside a layout root', () => {
    const inside: RenderTarget = {
      ...claude,
      deployments: [skillDeployment, { ...ambientDeployment, host: 'skills/README.md' }],
    };

    expect(() => assertRenderTargetsAreConsistent([inside], kinds)).not.toThrow();
  });

  it('accepts a host beside a layout root', () => {
    const beside: RenderTarget = {
      ...claude,
      deployments: [skillDeployment, { ...ambientDeployment, host: 'skills-index.md' }],
    };

    expect(() => assertRenderTargetsAreConsistent([beside], kinds)).not.toThrow();
  });

  // The root is the target's own directory, which every host sits under and none claims as a file.
  it('accepts a host beneath a layout rooted at the target root', () => {
    const rooted: RenderTarget = {
      ...claude,
      deployments: [
        { form: 'tree', kindId: 'skill', layout: { form: 'file', root: '', extension: '.md' } },
        ambientDeployment,
      ],
    };

    expect(() => assertRenderTargetsAreConsistent([rooted], kinds)).not.toThrow();
  });

  it.each([
    ['stands no placeholder', { open: '<!-- rulebook -->', close: '<!-- /{artifactId} -->' }, 'open', 0],
    ['stands two', { open: '<!-- {artifactId} -->', close: '<!-- /{artifactId}{artifactId} -->' }, 'close', 2],
  ])('reports a contribution marker template that %s', (_label, contributionMarkers, role, count) => {
    const wrong: RenderTarget = { ...claude, deployments: [{ ...ambientDeployment, contributionMarkers }] };

    expect(violationsOf([wrong])).toStrictEqual([
      {
        path: `targets[0].deployments[0].contributionMarkers.${role}`,
        message: `stands ${ARTIFACT_ID_PLACEHOLDER} ${count} times, but exactly one names the contributor`,
      },
    ]);
  });

  it.each([
    ['markers', { open: '<!-- codeassembly -->', close: '<!-- codeassembly -->' }, 'markers'],
    ['contribution markers', { open: '{artifactId}', close: '{artifactId}' }, 'contributionMarkers'],
  ])('reports %s that could not delimit a span', (_label, pair, field) => {
    const wrong: RenderTarget = { ...claude, deployments: [{ ...ambientDeployment, [field]: pair }] };

    expect(violationsOf([wrong]).map(({ path }) => path)).toStrictEqual([`targets[0].deployments[0].${field}`]);
  });

  it('reports markers spanning a line break, which no line-anchored match could find', () => {
    const wrong: RenderTarget = {
      ...claude,
      deployments: [{ ...ambientDeployment, markers: { open: '<!--\ncodeassembly -->', close: '<!-- /x -->' } }],
    };

    expect(violationsOf([wrong])).toStrictEqual([
      { path: 'targets[0].deployments[0].markers', message: 'A region marker must occupy a single line.' },
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
