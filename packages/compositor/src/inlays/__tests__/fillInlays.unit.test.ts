import { describe, expect, it } from 'vitest';

import type { ArtifactRender } from '../../render/renderArtifact.ts';
import type { RenderTarget } from '../../schemas/render-target-schemas.ts';
import type { ArtifactId } from '../../schemas/scalar-schemas.ts';
import type { InlayBinding } from '../../selection/selectArtifacts.ts';
import type { InlayFill } from '../fillInlays.ts';
import { fillInlays } from '../fillInlays.ts';

const claude: RenderTarget = {
  id: 'claude',
  label: 'Claude',
  root: '/srv/app/.claude',
  tokenMappings: [],
  deployments: [
    { form: 'tree', kindId: 'skill', layout: { form: 'file', root: 'skills', extension: '.md' } },
    { form: 'tree', kindId: 'rulebook', layout: { form: 'file', root: 'rulebooks', extension: '.md' } },
  ],
  stages: [
    {
      kind: 'inlay',
      syntax: { open: '<!--', close: '-->' },
      markers: { open: '<!-- inlay:{inlayName}:start -->', close: '<!-- inlay:{inlayName}:end -->' },
      contributionMarkers: { open: '<!-- {artifactId} -->', close: '<!-- /{artifactId} -->' },
    },
  ],
};

describe(fillInlays, () => {
  it('splices a filler behind both marker pairs, at the line the directive stood on', () => {
    const fill = run({
      renders: [
        ['skill:review', rendered('# Review\n\nTail.\n', [{ name: 'preferences', insertAt: 2 }])],
        ['rulebook:naming', rendered('Name functions with a leading verb.\n')],
      ],
      bindings: [{ inlayName: 'preferences', artifactIds: ['rulebook:naming'] }],
    });

    expect(requireRendered(fill, 'skill:review').content).toBe(
      [
        '# Review',
        '',
        '<!-- inlay:preferences:start -->',
        '<!-- rulebook:naming -->',
        'Name functions with a leading verb.',
        '<!-- /rulebook:naming -->',
        '<!-- inlay:preferences:end -->',
        'Tail.',
        '',
      ].join('\n'),
    );
  });

  it('splices fillers in the order the binding names them, separated by a blank line', () => {
    const fill = run({
      renders: [
        ['skill:review', rendered('Lead.\n', [{ name: 'preferences', insertAt: 1 }])],
        ['rulebook:naming', rendered('Naming.\n')],
        ['rulebook:style', rendered('Style.\n')],
      ],
      bindings: [{ inlayName: 'preferences', artifactIds: ['rulebook:style', 'rulebook:naming'] }],
    });

    expect(requireRendered(fill, 'skill:review').content).toContain(
      ['<!-- rulebook:style -->', 'Style.', '<!-- /rulebook:style -->', '', '<!-- rulebook:naming -->'].join('\n'),
    );
  });

  it('fills each of several sites at the line it was recorded against', () => {
    const fill = run({
      renders: [
        [
          'skill:review',
          rendered('Lead.\nMiddle.\nTail.\n', [
            { name: 'first', insertAt: 1 },
            { name: 'second', insertAt: 2 },
          ]),
        ],
        ['rulebook:naming', rendered('Naming.\n')],
        ['rulebook:style', rendered('Style.\n')],
      ],
      bindings: [
        { inlayName: 'first', artifactIds: ['rulebook:naming'] },
        { inlayName: 'second', artifactIds: ['rulebook:style'] },
      ],
    });

    expect(requireRendered(fill, 'skill:review').content).toBe(
      [
        'Lead.',
        '<!-- inlay:first:start -->',
        '<!-- rulebook:naming -->',
        'Naming.',
        '<!-- /rulebook:naming -->',
        '<!-- inlay:first:end -->',
        'Middle.',
        '<!-- inlay:second:start -->',
        '<!-- rulebook:style -->',
        'Style.',
        '<!-- /rulebook:style -->',
        '<!-- inlay:second:end -->',
        'Tail.',
        '',
      ].join('\n'),
    );
  });

  // Two directives on consecutive lines record one index between them; splicing in reverse is what orders the blocks.
  it('keeps two inlays recorded at one index in the order the body declared them', () => {
    const fill = run({
      renders: [
        [
          'skill:review',
          rendered('Tail.\n', [
            { name: 'first', insertAt: 0 },
            { name: 'second', insertAt: 0 },
          ]),
        ],
        ['rulebook:naming', rendered('Naming.\n')],
        ['rulebook:style', rendered('Style.\n')],
      ],
      bindings: [
        { inlayName: 'first', artifactIds: ['rulebook:naming'] },
        { inlayName: 'second', artifactIds: ['rulebook:style'] },
      ],
    });

    const content = requireRendered(fill, 'skill:review').content;

    expect(content.indexOf('<!-- inlay:first:start -->')).toBeLessThan(content.indexOf('<!-- inlay:second:start -->'));
    expect(content.startsWith('<!-- inlay:first:start -->')).toBe(true);
  });

  it('leaves an inlay nothing is bound to empty of every marker', () => {
    const content = 'Lead.\nTail.\n';
    const fill = run({
      renders: [['skill:review', rendered(content, [{ name: 'preferences', insertAt: 1 }])]],
      bindings: [],
    });

    expect(requireRendered(fill, 'skill:review').content).toBe(content);
    expect(fill.diagnostics).toStrictEqual([]);
  });

  it('rewrites each line of a filler by the stage’s reshape rule', () => {
    const reshaping: RenderTarget = {
      ...claude,
      stages: [{ ...requireInlayStage(), reshape: { pattern: String.raw`^(#{1,5})(?=\s)`, replacement: '$1#' } }],
    };
    const fill = fillInlays({
      target: reshaping,
      renders: new Map([
        ['skill:review', rendered('Lead.\n', [{ name: 'preferences', insertAt: 1 }])],
        ['rulebook:naming', rendered('# Naming\n\n## Verbs\n')],
      ]),
      bindings: [{ inlayName: 'preferences', artifactIds: ['rulebook:naming'] }],
    });

    const content = requireRendered(fill, 'skill:review').content;

    expect(content).toContain('## Naming');
    expect(content).toContain('### Verbs');
  });

  it('names each filler as a contributor, with the markers its block was written behind', () => {
    const fill = run({
      renders: [
        ['skill:review', rendered('Lead.\n', [{ name: 'preferences', insertAt: 1 }])],
        ['rulebook:naming', rendered('Naming.\n')],
      ],
      bindings: [{ inlayName: 'preferences', artifactIds: ['rulebook:naming'] }],
    });

    expect(requireRendered(fill, 'skill:review').contributors.artifacts).toStrictEqual([
      { artifactId: 'skill:review' },
      {
        artifactId: 'rulebook:naming',
        marker: { open: '<!-- rulebook:naming -->', close: '<!-- /rulebook:naming -->' },
      },
    ]);
  });

  it('joins a filler’s partials to the host’s, in id order', () => {
    const host = rendered('Lead.\n', [{ name: 'preferences', insertAt: 1 }]);
    const fill = run({
      renders: [
        ['skill:review', { ...host, contributors: { ...host.contributors, partials: ['team:_data/shared.md'] } }],
        ['rulebook:naming', withPartial(rendered('Naming.\n'), 'team:_data/glossary.md')],
      ],
      bindings: [{ inlayName: 'preferences', artifactIds: ['rulebook:naming'] }],
    });

    const filled = requireRendered(fill, 'skill:review');

    expect(filled.contributors.partials).toStrictEqual(['team:_data/glossary.md', 'team:_data/shared.md']);
    expect(filled.partials.map(({ id }) => id)).toStrictEqual(['team:_data/glossary.md']);
  });

  it('ends the host’s render where a filler declares an inlay of its own', () => {
    const fill = run({
      renders: [
        ['skill:review', rendered('Lead.\n', [{ name: 'preferences', insertAt: 1 }])],
        ['rulebook:naming', rendered('Naming.\n', [{ name: 'deeper', insertAt: 1 }])],
      ],
      bindings: [{ inlayName: 'preferences', artifactIds: ['rulebook:naming'] }],
    });

    expect(fill.renders.get('skill:review')).toHaveProperty('failure.stage', 'binding');
    expect(fill.renders.get('skill:review')).toHaveProperty('failure.diagnostic.code', 'nested-inlay');
    expect(fill.diagnostics).toStrictEqual([]);
  });

  it('ends the host’s render where a filler’s own render ended', () => {
    const fill = run({
      renders: [
        ['skill:review', rendered('Lead.\n', [{ name: 'preferences', insertAt: 1 }])],
        [
          'rulebook:naming',
          {
            status: 'failed',
            failure: { stage: 'inlay', diagnostic: { code: 'duplicate-name', message: 'Declared twice.', line: 2 } },
          },
        ],
      ],
      bindings: [{ inlayName: 'preferences', artifactIds: ['rulebook:naming'] }],
    });

    expect(fill.renders.get('skill:review')).toHaveProperty('failure.diagnostic.code', 'unrenderable-binding');
  });

  it('reports a filler of a kind the target deploys nowhere and splices nothing for it', () => {
    const fill = run({
      renders: [['skill:review', rendered('Lead.\nTail.\n', [{ name: 'preferences', insertAt: 1 }])]],
      bindings: [{ inlayName: 'preferences', artifactIds: ['subagent:auditor'] }],
    });

    expect(requireRendered(fill, 'skill:review').content).toBe('Lead.\nTail.\n');
    expect(fill.diagnostics).toStrictEqual([
      {
        code: 'undeployed-kind',
        message: '"subagent:auditor" is of a kind "claude" deploys nowhere, so it fills nothing there.',
        at: {
          inlayName: 'preferences',
          targetId: 'claude',
          hostArtifactId: 'skill:review',
          artifactId: 'subagent:auditor',
        },
      },
    ]);
  });

  it('leaves every render alone for a target declaring no inlay stage', () => {
    const renders = new Map<ArtifactId, ArtifactRender>([
      ['skill:review', rendered('Lead.\n', [{ name: 'preferences', insertAt: 1 }])],
    ]);
    const bare: RenderTarget = { ...claude, stages: [] };

    const fill = fillInlays({ target: bare, renders, bindings: [] });

    expect(fill.renders).toBe(renders);
    expect(fill.diagnostics).toStrictEqual([]);
  });
});

// region | Helpers

/** Builds one artifact's completed render, declaring the inlay sites given. */
function rendered(content: string, inlays: InlaySites = []): RenderedFixture {
  return {
    status: 'rendered',
    content,
    contributors: { artifacts: [{ artifactId: 'skill:review' }], partials: [] },
    partials: [],
    diagnostics: [],
    inlays,
  };
}

/** The sites a fixture's body declares. */
type InlaySites = ReadonlyArray<{ name: string; insertAt: number }>;

/** One artifact's completed render, narrowed so a fixture can be read without re-narrowing it. */
type RenderedFixture = Extract<ArtifactRender, { status: 'rendered' }>;

/** Reads the render a fill produced for `artifactId`, failing the test where it did not complete. */
function requireRendered(fill: InlayFill, artifactId: ArtifactId): RenderedFixture {
  const render = fill.renders.get(artifactId);
  if (render?.status !== 'rendered') {
    throw new Error(`Expected "${artifactId}" to be rendered, but it is ${render?.status ?? 'absent'}.`);
  }
  return render;
}

/** Reads the fixture target's inlay stage, which it declares exactly one of. */
function requireInlayStage(): Extract<RenderTarget['stages'][number], { kind: 'inlay' }> {
  const stage = claude.stages.find((held) => held.kind === 'inlay');
  if (stage === undefined) {
    throw new Error('The fixture target declares an inlay stage.');
  }
  return stage;
}

/** Fills the fixture target's inlays over the renders and bindings given. */
function run(input: {
  renders: ReadonlyArray<readonly [ArtifactId, ArtifactRender]>;
  bindings: ReadonlyArray<InlayBinding>;
}): InlayFill {
  return fillInlays({ target: claude, renders: new Map(input.renders), bindings: input.bindings });
}

/** Adds one transcluded partial to a render, as both an entry and a contributor. */
function withPartial(render: RenderedFixture, id: string): RenderedFixture {
  return {
    ...render,
    contributors: { ...render.contributors, partials: [id] },
    partials: [{ id, sourceId: 'team', path: id.split(':', 2).at(1) ?? id, hash: 'hash' }],
  };
}

// endregion | Helpers
