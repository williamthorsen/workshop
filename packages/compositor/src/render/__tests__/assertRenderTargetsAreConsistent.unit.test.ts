import { captureError } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { ARTIFACT_ID_PLACEHOLDER } from '../../deployment/contribution-markers.ts';
import { INLAY_NAME_PLACEHOLDER } from '../../inlays/inlay-markers.ts';
import type { KindDescriptor } from '../../schemas/descriptor-schemas.ts';
import type { OwnedItemsDeclaration } from '../../schemas/owned-items-schemas.ts';
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

const inlayStage = {
  kind: 'inlay',
  syntax: { open: '<!--', close: '-->' },
  markers: { open: '<!-- inlay:{inlayName}:start -->', close: '<!-- inlay:{inlayName}:end -->' },
  contributionMarkers: { open: '<!-- {artifactId} -->', close: '<!-- /{artifactId} -->' },
  reshape: { pattern: String.raw`^(#{1,5})(?=\s)`, replacement: '$1#' },
} as const;

const settingsHooks: OwnedItemsDeclaration = {
  format: 'json',
  collection: ['hooks'],
  sentinel: { path: ['source'], value: 'codeassembly' },
  host: 'settings.json',
  items: [{ command: 'relay --on=stop' }],
};

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

  describe('owned-items declarations', () => {
    it('accepts a target owning items in a host nothing else writes', () => {
      const owning: RenderTarget = { ...claude, ownedItems: [settingsHooks] };

      expect(() => assertRenderTargetsAreConsistent([owning], kinds)).not.toThrow();
    });

    it('accepts two declarations owning different collections of one host', () => {
      const owning: RenderTarget = {
        ...claude,
        ownedItems: [
          { ...settingsHooks, collection: ['hooks', 'SessionStart'] },
          { ...settingsHooks, collection: ['hooks', 'Stop'] },
        ],
      };

      expect(() => assertRenderTargetsAreConsistent([owning], kinds)).not.toThrow();
    });

    it('reports two declarations contending for one collection of one host', async () => {
      const contested: RenderTarget = { ...claude, ownedItems: [settingsHooks, settingsHooks] };

      await expect(violationsOf([contested])).resolves.toStrictEqual([
        { path: 'targets[0].ownedItems', message: 'owns "settings.json at hooks" more than once' },
      ]);
    });

    it('reports two declarations disagreeing about their host\u{2019}s format, a file having one', async () => {
      const mixed: RenderTarget = {
        ...claude,
        ownedItems: [
          { ...settingsHooks, collection: ['hooks', 'SessionStart'] },
          { ...settingsHooks, collection: ['hooks', 'Stop'], format: 'yaml' },
        ],
      };

      await expect(violationsOf([mixed])).resolves.toStrictEqual([
        {
          path: 'targets[0].ownedItems[1].format',
          message: 'is "yaml" where the same host is declared "json", and a file has one',
        },
      ]);
    });

    it.each([
      ['an outer collection declared first', ['hooks'], ['hooks', 'Stop']],
      ['an inner collection declared first', ['hooks', 'Stop'], ['hooks']],
    ])('reports %s nesting inside the other on one host', async (_label, first, second) => {
      const nested: RenderTarget = {
        ...claude,
        ownedItems: [
          { ...settingsHooks, collection: [...first] },
          { ...settingsHooks, collection: [...second] },
        ],
      };

      await expect(violationsOf([nested])).resolves.toStrictEqual([
        {
          path: 'targets[0].ownedItems[1].collection',
          message: `nests with "${first.join('.')}" on the same host, and no key descends through a collection`,
        },
      ]);
    });

    it('accepts declarations whose collections branch apart at unequal depths, none holding another', () => {
      const branching: RenderTarget = {
        ...claude,
        ownedItems: [
          { ...settingsHooks, collection: ['hooks', 'Stop'] },
          { ...settingsHooks, collection: ['hooks', 'SessionStart', 'shell'] },
          { ...settingsHooks, collection: ['agents'] },
        ],
      };

      expect(() => assertRenderTargetsAreConsistent([branching], kinds)).not.toThrow();
    });

    it('reports an item a stampable sentinel could not be written into', async () => {
      const scalar: RenderTarget = { ...claude, ownedItems: [{ ...settingsHooks, items: ['relay --on=stop'] }] };

      await expect(violationsOf([scalar])).resolves.toStrictEqual([
        {
          path: 'targets[0].ownedItems[0].items[0]',
          message: 'Cannot mark an item with a sentinel at "source": the item is not a mapping.',
        },
      ]);
    });

    it('reports an item whose sentinel path runs through a value that is not a mapping', async () => {
      const blocked: RenderTarget = {
        ...claude,
        ownedItems: [
          {
            ...settingsHooks,
            sentinel: { path: ['meta', 'writtenBy'], value: 'codeassembly' },
            items: [{ meta: 'vendor-tool' }],
          },
        ],
      };

      await expect(violationsOf([blocked])).resolves.toStrictEqual([
        {
          path: 'targets[0].ownedItems[0].items[0]',
          message: 'Cannot mark an item with a sentinel at "meta.writtenBy": "meta" is not a mapping.',
        },
      ]);
    });

    it('reports a host a region deployment already writes whole', async () => {
      const contested: RenderTarget = {
        ...claude,
        deployments: [skillDeployment, ambientDeployment],
        ownedItems: [{ ...settingsHooks, host: 'CLAUDE.md' }],
      };

      await expect(violationsOf([contested])).resolves.toStrictEqual([
        {
          path: 'targets[0].ownedItems[0].host',
          message: 'is also a region host, so two mechanisms would each compute the whole file',
        },
      ]);
    });

    it('reports a host standing where a tree layout needs a directory', async () => {
      const contested: RenderTarget = { ...claude, ownedItems: [{ ...settingsHooks, host: 'skills' }] };

      await expect(violationsOf([contested])).resolves.toStrictEqual([
        {
          path: 'targets[0].ownedItems[0].host',
          message: 'collides with the layout root "skills", which needs a directory where this host is a file',
        },
      ]);
    });

    it('reports an item the declaration could never find again, under a sentinel it cannot write', async () => {
      const unmarkable: RenderTarget = {
        ...claude,
        ownedItems: [
          {
            ...settingsHooks,
            sentinel: { path: ['commands', '*'], value: '--sentinel codeassembly', match: 'contains' },
            items: [{ commands: ['relay --on=stop'] }],
          },
        ],
      };

      await expect(violationsOf([unmarkable])).resolves.toStrictEqual([
        {
          path: 'targets[0].ownedItems[0].items[0]',
          message: 'does not have the sentinel, which this declaration cannot write, so it could never be found again',
        },
      ]);
    });

    it('accepts an item that already carries a sentinel the declaration cannot write', () => {
      const marked: RenderTarget = {
        ...claude,
        ownedItems: [
          {
            ...settingsHooks,
            sentinel: { path: ['commands', '*'], value: '--sentinel codeassembly', match: 'contains' },
            items: [{ commands: ['relay --on=stop --sentinel codeassembly'] }],
          },
        ],
      };

      expect(() => assertRenderTargetsAreConsistent([marked], kinds)).not.toThrow();
    });
  });

  it('reports a target that repeats a stage kind', async () => {
    const repeated: RenderTarget = { ...claude, stages: [{ kind: 'tokens' }, { kind: 'tokens' }] };

    await expect(violationsOf([repeated])).resolves.toStrictEqual([
      { path: 'targets[0].stages', message: 'runs "tokens" more than once' },
    ]);
  });

  it('reports a target that deploys one kind twice', async () => {
    const repeated: RenderTarget = { ...claude, deployments: [skillDeployment, skillDeployment] };

    await expect(violationsOf([repeated])).resolves.toStrictEqual([
      { path: 'targets[0].deployments', message: 'deploys "skill" more than once' },
    ]);
  });

  it('reports a deployment naming a kind no descriptor carries', async () => {
    const unknown: RenderTarget = {
      ...claude,
      deployments: [{ ...skillDeployment, kindId: 'subagent' }],
    };

    await expect(violationsOf([unknown])).resolves.toStrictEqual([
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

  it('reports a name template standing no placeholder, which deploys one name for every artifact', async () => {
    const fixed: RenderTarget = { ...claude, deployments: [{ ...skillDeployment, nameTemplate: 'guidance' }] };

    await expect(violationsOf([fixed])).resolves.toStrictEqual([
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
    async (_label, nameTemplate) => {
      const hidden: RenderTarget = { ...claude, deployments: [{ ...skillDeployment, nameTemplate }] };

      await expect(violationsOf([hidden])).resolves.toStrictEqual([
        {
          path: 'targets[0].deployments[0].nameTemplate',
          message: 'renders a support-prefixed name, which a destination scan passes over',
        },
      ]);
    },
  );

  it('reports a link grammar that does not compile', async () => {
    const broken: RenderTarget = { ...claude, stages: [{ kind: 'links', pattern: '([a-z' }] };

    await expect(violationsOf([broken])).resolves.toStrictEqual([
      { path: 'targets[0].stages[0].pattern', message: 'is not a valid regular expression' },
    ]);
  });

  it.each([
    ['captures nothing to rewrite', String.raw`\[[^\]]*\]\([^)]+\)`, 0],
    ['leaves the engine a choice of captures', String.raw`\[([^\]]*)\]\(([^)]+)\)`, 2],
  ])('reports a link grammar that %s', async (_label, pattern, groups) => {
    const wrong: RenderTarget = { ...claude, stages: [{ kind: 'links', pattern }] };

    await expect(violationsOf([wrong])).resolves.toStrictEqual([
      {
        path: 'targets[0].stages[0].pattern',
        message: `captures ${groups} groups, but exactly one names the link target`,
      },
    ]);
  });

  it('reports a kind deployed once as a tree and once into a host', async () => {
    const both: RenderTarget = { ...claude, deployments: [skillDeployment, { ...ambientDeployment, kindId: 'skill' }] };

    await expect(violationsOf([both])).resolves.toStrictEqual([
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

  it('reports a host standing where a layout root goes', async () => {
    const collided: RenderTarget = {
      ...claude,
      deployments: [skillDeployment, { ...ambientDeployment, host: 'skills' }],
    };

    await expect(violationsOf([collided])).resolves.toStrictEqual([
      {
        path: 'targets[0].deployments[1].host',
        message: 'collides with the layout root "skills", which needs a directory where this host is a file',
      },
    ]);
  });

  it('reports a host standing at a directory a layout root is nested inside', async () => {
    const nested = {
      form: 'tree',
      kindId: 'skill',
      layout: { form: 'directory', root: 'agents/skills', entryFile: 'SKILL.md' },
    } as const;
    const collided: RenderTarget = { ...claude, deployments: [nested, { ...ambientDeployment, host: 'agents' }] };

    await expect(violationsOf([collided])).resolves.toStrictEqual([
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
  ])('reports a contribution marker template that %s', async (_label, contributionMarkers, role, count) => {
    const wrong: RenderTarget = { ...claude, deployments: [{ ...ambientDeployment, contributionMarkers }] };

    await expect(violationsOf([wrong])).resolves.toStrictEqual([
      {
        path: `targets[0].deployments[0].contributionMarkers.${role}`,
        message: `stands ${ARTIFACT_ID_PLACEHOLDER} ${count} times, but exactly one names the contributor`,
      },
    ]);
  });

  it.each([
    ['markers', { open: '<!-- codeassembly -->', close: '<!-- codeassembly -->' }, 'markers'],
    ['contribution markers', { open: '{artifactId}', close: '{artifactId}' }, 'contributionMarkers'],
  ])('reports %s that could not delimit a span', async (_label, pair, field) => {
    const wrong: RenderTarget = { ...claude, deployments: [{ ...ambientDeployment, [field]: pair }] };

    expect((await violationsOf([wrong])).map(({ path }) => path)).toStrictEqual([`targets[0].deployments[0].${field}`]);
  });

  it('reports markers spanning a line break, which no line-anchored match could find', async () => {
    const wrong: RenderTarget = {
      ...claude,
      deployments: [{ ...ambientDeployment, markers: { open: '<!--\ncodeassembly -->', close: '<!-- /x -->' } }],
    };

    await expect(violationsOf([wrong])).resolves.toStrictEqual([
      { path: 'targets[0].deployments[0].markers', message: 'A region marker must occupy a single line.' },
    ]);
  });

  it('accepts an inlay stage whose markers, contribution markers, and reshape rule all do their jobs', () => {
    const inlaying: RenderTarget = { ...claude, stages: [inlayStage] };

    expect(() => assertRenderTargetsAreConsistent([inlaying], kinds)).not.toThrow();
  });

  it.each([
    ['markers', { open: '<!-- {inlayName} -->', close: '<!-- {inlayName} -->' }, 'markers'],
    ['contribution markers', { open: '{artifactId}', close: '{artifactId}' }, 'contributionMarkers'],
  ])("reports an inlay stage's %s that could not delimit a span", async (_label, pair, field) => {
    const wrong: RenderTarget = { ...claude, stages: [{ ...inlayStage, [field]: pair }] };

    expect((await violationsOf([wrong])).map(({ path }) => path)).toStrictEqual([`targets[0].stages[0].${field}`]);
  });

  it.each([
    ['stands no placeholder', { open: '<!-- start -->', close: '<!-- {inlayName}:end -->' }, 'open', 0],
    ['stands two', { open: '<!-- {inlayName}:{inlayName}:start -->', close: '<!-- {inlayName}:end -->' }, 'open', 2],
  ])('reports an inlay marker template that %s', async (_label, markers, role, count) => {
    const wrong: RenderTarget = { ...claude, stages: [{ ...inlayStage, markers }] };

    await expect(violationsOf([wrong])).resolves.toStrictEqual([
      {
        path: `targets[0].stages[0].markers.${role}`,
        message: `stands ${INLAY_NAME_PLACEHOLDER} ${count} times, but exactly one names the inlay`,
      },
    ]);
  });

  it('reports a reshape rule that does not compile', async () => {
    const wrong: RenderTarget = {
      ...claude,
      stages: [{ ...inlayStage, reshape: { pattern: '(#{1,5}', replacement: '$1#' } }],
    };

    await expect(violationsOf([wrong])).resolves.toStrictEqual([
      { path: 'targets[0].stages[0].reshape.pattern', message: 'is not a valid regular expression' },
    ]);
  });

  it('reports two targets sharing an id', async () => {
    await expect(violationsOf([claude, claude])).resolves.toStrictEqual([
      { path: 'targets', message: 'lists "claude" more than once' },
    ]);
  });

  it('reports every violation in one run, rather than the first', async () => {
    const broken: RenderTarget = {
      ...claude,
      deployments: [{ ...skillDeployment, kindId: 'subagent' }],
      stages: [{ kind: 'tokens' }, { kind: 'tokens' }, { kind: 'links', pattern: '(a)(b)' }],
    };

    expect((await violationsOf([broken])).map(({ path }) => path)).toStrictEqual([
      'targets[0].stages',
      'targets[0].deployments[0].kindId',
      'targets[0].stages[2].pattern',
    ]);
  });
});

// region | Helpers

/** Runs the assertion and reads back the violations it raised, failing the test if it raised none. */
async function violationsOf(targets: ReadonlyArray<RenderTarget>): Promise<ReadonlyArray<RenderTargetViolation>> {
  return (await captureError(RenderTargetConsistencyError, () => assertRenderTargetsAreConsistent(targets, kinds)))
    .violations;
}

// endregion | Helpers
