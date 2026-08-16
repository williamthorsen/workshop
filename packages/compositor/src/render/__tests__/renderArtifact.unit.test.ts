import { describe, expect, it } from 'vitest';

import type { DeployableArtifact } from '../../deployment/resolveDeployedNames.ts';
import { resolveDeployedNames } from '../../deployment/resolveDeployedNames.ts';
import type { RenderTarget } from '../../schemas/render-target-schemas.ts';
import type { TokenKind } from '../../schemas/token-kind-schemas.ts';
import { buildTempTree } from '../../test-utils/buildTempTree.ts';
import type { ArtifactRender } from '../renderArtifact.ts';
import { renderArtifact } from '../renderArtifact.ts';

const COMMENT = { open: '<!--', close: '-->' } as const;
const MARKDOWN_LINK = String.raw`\[[^\]]*\]\(([^)]+)\)`;

const tokenKinds: ReadonlyArray<TokenKind> = [
  { id: 'tool', label: 'Tool name', form: 'mapping', pattern: String.raw`\{tool:(\w+)\}` },
];

const review: DeployableArtifact = { id: 'skill:review', kindId: 'skill', slug: 'review' };

const claude: RenderTarget = {
  id: 'claude',
  label: 'Claude',
  root: '~/.claude',
  tokenMappings: [{ kindId: 'tool', entries: [{ from: 'Read', to: 'view' }] }],
  deployments: [
    { form: 'tree', kindId: 'skill', layout: { form: 'directory', root: 'skills', entryFile: 'SKILL.md' } },
  ],
  stages: [{ kind: 'transclusion', syntax: COMMENT }, { kind: 'tokens' }, { kind: 'links', pattern: MARKDOWN_LINK }],
};

const inlaying: RenderTarget = {
  ...claude,
  stages: [
    { kind: 'transclusion', syntax: COMMENT },
    {
      kind: 'inlay',
      syntax: COMMENT,
      markers: { open: '<!-- inlay:{inlayName}:start -->', close: '<!-- inlay:{inlayName}:end -->' },
      contributionMarkers: { open: '<!-- {artifactId} -->', close: '<!-- /{artifactId} -->' },
    },
  ],
};

describe(renderArtifact, () => {
  it('renders an artifact through every stage its target declares', async () => {
    const dir = await buildTempTree({
      'skills/review/SKILL.md': 'Use {tool:Read} on [the rubric](./rubric.md).\n',
    });

    const result = await render(dir, claude);

    expect(requireRendered(result).content).toBe('Use view on [the rubric](~/.claude/skills/review/rubric.md).\n');
  });

  it('resolves a link against the name the artifact deploys under, not against its slug', async () => {
    const dir = await buildTempTree({ 'skills/review/SKILL.md': 'See [the rubric](./rubric.md).\n' });
    const renamed: RenderTarget = {
      ...claude,
      deployments: [
        {
          form: 'tree',
          kindId: 'skill',
          layout: { form: 'directory', root: 'skills', entryFile: 'SKILL.md' },
          nameTemplate: 'consult-{slug}',
        },
      ],
    };

    const result = await render(dir, renamed);

    expect(requireRendered(result).content).toBe('See [the rubric](~/.claude/skills/consult-review/rubric.md).\n');
  });

  it('renders for a destination rooted at a plain path rather than a home-relative one', async () => {
    const dir = await buildTempTree({ 'skills/review/SKILL.md': 'See [the rubric](./rubric.md).\n' });
    const served: RenderTarget = { ...claude, root: '/srv/out' };

    const result = await render(dir, served);

    expect(requireRendered(result).content).toBe('See [the rubric](/srv/out/skills/review/rubric.md).\n');
  });

  it('reports the artifact and every partial that reached the rendered file', async () => {
    const dir = await buildTempTree({
      '_data/shared.md': 'Shared text.\n',
      'skills/review/SKILL.md': '# Review\n\n<!-- include: ../../_data/shared.md / -->\n',
    });

    const result = await render(dir, claude);

    expect(requireRendered(result).contributors).toStrictEqual({
      artifacts: [{ artifactId: 'skill:review' }],
      partials: ['team:_data/shared.md'],
    });
  });

  it('reports each partial with the record a plan carries', async () => {
    const dir = await buildTempTree({
      '_data/shared.md': 'Shared text.\n',
      'skills/review/SKILL.md': '<!-- include: ../../_data/shared.md / -->\n',
    });

    const result = await render(dir, claude);
    const [partial] = requireRendered(result).partials;

    expect(partial?.path).toBe('_data/shared.md');
    expect(partial?.hash.startsWith('sha256:')).toBe(true);
  });

  it('renders unchanged inputs byte-identically', async () => {
    const dir = await buildTempTree({
      '_data/shared.md': 'Shared {tool:Read}.\n',
      'skills/review/SKILL.md': '# Review\n\n<!-- include: ../../_data/shared.md / -->\n\n[x](./y.md)\n',
    });

    const first = await render(dir, claude);
    const second = await render(dir, claude);

    expect(requireRendered(second).content).toBe(requireRendered(first).content);
  });

  it('reads the file directly for a target that declares no transclusion stage', async () => {
    const dir = await buildTempTree({ 'skills/review/SKILL.md': '# Review\n\nRead the diff.\n' });
    const noStages: RenderTarget = { ...claude, stages: [] };

    const result = await render(dir, noStages);

    expect(requireRendered(result).content).toBe('# Review\n\nRead the diff.\n');
    expect(requireRendered(result).partials).toStrictEqual([]);
  });

  it('applies the target overlay to the rendered frontmatter', async () => {
    const dir = await buildTempTree({ 'skills/review/SKILL.md': '---\nname: review\n---\nRead the diff.\n' });
    const overlaid: RenderTarget = {
      ...claude,
      stages: [...claude.stages, { kind: 'frontmatter', overlay: { defaults: { model: 'opus' } } }],
    };

    const result = await render(dir, overlaid);

    expect(requireRendered(result).content).toBe('---\nname: review\nmodel: opus\n---\nRead the diff.\n');
  });

  it('reports what a stage could not resolve beside the content it still produced', async () => {
    const dir = await buildTempTree({ 'skills/review/SKILL.md': 'Use {tool:Bash} on [x](../../../away.md).\n' });

    const result = await render(dir, claude);

    expect(requireRendered(result).diagnostics.map(({ stage }) => stage)).toStrictEqual(['links', 'tokens']);
    expect(requireRendered(result).content).toBe('Use {tool:Bash} on [x](../../../away.md).\n');
  });

  it('ends the render at a directive it cannot resolve, since no body survives it', async () => {
    const dir = await buildTempTree({ 'skills/review/SKILL.md': '<!-- include: ../../_data/absent.md / -->\n' });

    const result = await render(dir, claude);

    expect(result.status).toBe('failed');
  });

  it('strips an inlay directive and reports the line it stood on', async () => {
    const dir = await buildTempTree({ 'skills/review/SKILL.md': '# Review\n\n<!-- inlay: preferences -->\n\nTail.\n' });

    const result = await render(dir, inlaying);

    expect(requireRendered(result).content).toBe('# Review\n\n\nTail.\n');
    expect(requireRendered(result).inlays).toStrictEqual([{ name: 'preferences', insertAt: 2 }]);
  });

  // The overlay re-emits its block, so a site computed before it ran would address the line above the right one.
  it('addresses a site against the content the frontmatter overlay produced', async () => {
    const dir = await buildTempTree({
      'skills/review/SKILL.md': '---\nname: review\n---\n<!-- inlay: preferences -->\nTail.\n',
    });
    const overlaid: RenderTarget = {
      ...inlaying,
      stages: [...inlaying.stages, { kind: 'frontmatter', overlay: { defaults: { model: 'opus' } } }],
    };

    const result = await render(dir, overlaid);

    expect(requireRendered(result).content).toBe('---\nname: review\nmodel: opus\n---\nTail.\n');
    expect(requireRendered(result).inlays).toStrictEqual([{ name: 'preferences', insertAt: 4 }]);
  });

  it('finds an inlay a transcluded partial declared', async () => {
    const dir = await buildTempTree({
      '_data/shared.md': 'Shared text.\n<!-- inlay: preferences -->\n',
      'skills/review/SKILL.md': '# Review\n\n<!-- include: ../../_data/shared.md / -->\n',
    });

    const result = await render(dir, inlaying);

    expect(requireRendered(result).inlays).toStrictEqual([{ name: 'preferences', insertAt: 3 }]);
  });

  it('strips an inlay for a kind the target routes into a region of a host', async () => {
    const dir = await buildTempTree({ 'skills/review/SKILL.md': 'Lead.\n<!-- inlay: preferences -->\n' });
    const routed: RenderTarget = {
      ...inlaying,
      deployments: [
        {
          form: 'region',
          kindId: 'skill',
          host: 'CLAUDE.md',
          markers: { open: '<!-- team -->', close: '<!-- /team -->' },
          contributionMarkers: { open: '<!-- {artifactId} -->', close: '<!-- /{artifactId} -->' },
        },
      ],
    };

    const result = await render(dir, routed);

    expect(requireRendered(result).content).toBe('Lead.\n');
    expect(requireRendered(result).inlays).toStrictEqual([{ name: 'preferences', insertAt: 1 }]);
  });

  it('deploys an inlay directive as text for a target declaring no inlay stage', async () => {
    const dir = await buildTempTree({ 'skills/review/SKILL.md': '<!-- inlay: preferences -->\n' });

    const result = await render(dir, claude);

    expect(requireRendered(result).content).toBe('<!-- inlay: preferences -->\n');
    expect(requireRendered(result).inlays).toStrictEqual([]);
  });

  it('ends the render on a body declaring one inlay twice, naming the stage that stopped it', async () => {
    const dir = await buildTempTree({
      'skills/review/SKILL.md': '<!-- inlay: preferences -->\n<!-- inlay: preferences -->\n',
    });

    const result = await render(dir, inlaying);

    expect(result).toHaveProperty('failure.stage', 'inlay');
    expect(result).toHaveProperty('failure.diagnostic.code', 'duplicate-name');
  });

  it("renders nothing for a target taking none of the artifact's kind", async () => {
    const dir = await buildTempTree({ 'skills/review/SKILL.md': '# Review\n' });
    const takesNoSkills: RenderTarget = { ...claude, deployments: [] };

    const result = await render(dir, takesNoSkills);

    expect(result.status).toBe('not-deployed');
  });
});

// region | Helpers

/** Narrows a render to the shape every content assertion reads, failing the test when it produced none. */
function requireRendered(result: ArtifactRender): Extract<ArtifactRender, { status: 'rendered' }> {
  if (result.status !== 'rendered') {
    throw new Error(`Expected a rendered artifact, got "${result.status}".`);
  }
  return result;
}

/** Renders the review skill out of `dir` for one target, which every case varies. */
async function render(dir: string, target: RenderTarget): Promise<ArtifactRender> {
  return renderArtifact({
    artifact: review,
    entryPath: 'skills/review/SKILL.md',
    resolveDeployedName: resolveDeployedNames([review], [target]),
    source: { id: 'team', dir },
    target,
    tokenKinds,
  });
}

// endregion | Helpers
