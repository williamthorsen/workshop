import { describe, expect, it } from 'vitest';

import type { DeployableArtifact } from '../../deployment/resolveDeployedNames.ts';
import { resolveDeployedNames } from '../../deployment/resolveDeployedNames.ts';
import type { RenderStage, RenderTarget } from '../../schemas/render-target-schemas.ts';
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
  tokenMappings: [
    {
      kindId: 'tool',
      entries: [
        { from: 'Guidance', to: 'CLAUDE.md' },
        { from: 'Read', to: 'view' },
      ],
    },
  ],
  deployments: [
    { form: 'tree', kindId: 'skill', layout: { form: 'directory', root: 'skills', entryFile: 'SKILL.md' } },
  ],
  stages: [],
};

describe('per-target stage composition', () => {
  it('renders one artifact differently for two targets whose stage sets differ', async () => {
    const dir = await buildTempTree({ 'skills/review/SKILL.md': 'Use {tool:Read} on [x](./y.md).\n' });

    const both = await render(dir, [{ kind: 'tokens' }, { kind: 'links', pattern: MARKDOWN_LINK }]);
    const tokensOnly = await render(dir, [{ kind: 'tokens' }]);

    expect(contentOf(both)).toBe('Use view on [x](~/.claude/skills/review/y.md).\n');
    expect(contentOf(tokensOnly)).toBe('Use view on [x](./y.md).\n');
  });

  it('leaves a body untouched for a target declaring no stages at all', async () => {
    const body = 'Use {tool:Read} on [x](./y.md).\n';
    const dir = await buildTempTree({ 'skills/review/SKILL.md': body });

    expect(contentOf(await render(dir, []))).toBe(body);
  });

  it('runs transclusion first, so a token inside a partial is rewritten like one in the host', async () => {
    const dir = await buildTempTree({
      '_data/shared.md': 'Shared {tool:Read}.\n',
      'skills/review/SKILL.md': '<!-- include: ../../_data/shared.md / -->\n',
    });

    const result = await render(dir, [{ kind: 'transclusion', syntax: COMMENT }, { kind: 'tokens' }]);

    expect(contentOf(result)).toBe('Shared view.\n');
  });

  it('runs transclusion first, so a link inside a partial resolves against the host it renders into', async () => {
    const dir = await buildTempTree({
      '_data/shared.md': 'See [x](./y.md).\n',
      'skills/review/SKILL.md': '<!-- include: ../../_data/shared.md / -->\n',
    });

    const result = await render(dir, [
      { kind: 'transclusion', syntax: COMMENT },
      { kind: 'links', pattern: MARKDOWN_LINK },
    ]);

    expect(contentOf(result)).toBe('See [x](~/.claude/skills/review/y.md).\n');
  });

  it('runs link rewriting first, so a mapping value heading a target is inserted where it stands', async () => {
    const dir = await buildTempTree({ 'skills/review/SKILL.md': 'See [guidance]({tool:Guidance}).\n' });

    const result = await render(dir, [{ kind: 'links', pattern: MARKDOWN_LINK }, { kind: 'tokens' }]);

    expect(contentOf(result)).toBe('See [guidance](CLAUDE.md).\n');
  });

  it('resolves a target whose token sits behind a relative prefix, which is how a consumer asks for that', async () => {
    const dir = await buildTempTree({ 'skills/review/SKILL.md': 'See [guidance](./{tool:Guidance}).\n' });

    const result = await render(dir, [{ kind: 'links', pattern: MARKDOWN_LINK }, { kind: 'tokens' }]);

    expect(contentOf(result)).toBe('See [guidance](~/.claude/skills/review/CLAUDE.md).\n');
  });

  it('runs the overlay last, so a value the target supplies is not rewritten as though an author wrote it', async () => {
    const dir = await buildTempTree({ 'skills/review/SKILL.md': '---\nname: review\n---\nBody.\n' });

    const result = await render(dir, [
      { kind: 'tokens' },
      { kind: 'frontmatter', overlay: { defaults: { hint: '{tool:Read}' } } },
    ]);

    expect(contentOf(result)).toBe('---\nname: review\nhint: "{tool:Read}"\n---\nBody.\n');
  });

  it('declares stage participation, not sequence, so a reordered declaration renders the same', async () => {
    const dir = await buildTempTree({ 'skills/review/SKILL.md': 'Use {tool:Read} on [x](./y.md).\n' });

    const declared = await render(dir, [{ kind: 'tokens' }, { kind: 'links', pattern: MARKDOWN_LINK }]);
    const reversed = await render(dir, [{ kind: 'links', pattern: MARKDOWN_LINK }, { kind: 'tokens' }]);

    expect(contentOf(reversed)).toBe(contentOf(declared));
  });
});

// region | Helpers

/** Reads back the rendered content, failing the test when the render produced none. */
function contentOf(result: ArtifactRender): string {
  if (result.status !== 'rendered') {
    throw new Error(`Expected a rendered artifact, got "${result.status}".`);
  }
  return result.content;
}

/** Renders the review skill for a Claude target running exactly `stages`. */
async function render(dir: string, stages: ReadonlyArray<RenderStage>): Promise<ArtifactRender> {
  const target: RenderTarget = { ...claude, stages: [...stages] };
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
