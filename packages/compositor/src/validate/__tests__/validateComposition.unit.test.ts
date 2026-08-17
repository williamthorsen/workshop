import { describe, expect, it } from 'vitest';

import { StaleSnapshotError } from '../../config/StaleSnapshotError.ts';
import type { RenderTarget } from '../../schemas/render-target-schemas.ts';
import type { TokenKind } from '../../schemas/token-kind-schemas.ts';
import { buildConfig } from '../../test-utils/buildConfig.ts';
import type { CaptureCompositionOptions } from '../../test-utils/captureComposition.ts';
import { captureComposition } from '../../test-utils/captureComposition.ts';
import {
  buildClaudeTarget,
  buildInlayingTarget,
  buildOverlappingTargets,
  CONTRIBUTION_MARKERS,
  HOST_PATH,
} from '../../test-utils/composition-fixture.ts';
import { validateComposition } from '../validateComposition.ts';

const MARKDOWN_LINK = String.raw`\[[^\]]*\]\(([^)]+)\)`;

const TOKEN_KINDS: ReadonlyArray<TokenKind> = [
  { id: 'tool', label: 'Tool name', form: 'mapping', pattern: String.raw`\{tool:(\w+)\}` },
];

/** The rule that makes a collection's `skills` key an edge, so a slug naming nothing becomes a closure fault. */
const MEMBER_RULE = {
  kindId: 'collection',
  key: 'skills',
  via: 'member',
  form: 'flat',
  targetKindId: 'skill',
} as const;

describe(validateComposition, () => {
  it('reports nothing for a composition with nothing wrong in it', async () => {
    const { config, snapshot } = await captureComposition();

    expect(validateComposition(config, snapshot).diagnostics).toStrictEqual([]);
  });

  it('reports a selector naming an artifact the catalog does not carry, at the config entry', async () => {
    const { config, snapshot } = await captureComposition({ select: { skill: { use: ['absent'] } } });

    expect(validateComposition(config, snapshot).diagnostics).toStrictEqual([
      {
        domain: 'selection',
        diagnostic: {
          code: 'unknown-artifact',
          message: expect.stringContaining('absent'),
          at: { tierId: 'project', kindId: 'skill', list: 'use', index: 0 },
        },
      },
    ]);
  });

  it('reports a frontmatter edge naming an artifact nothing carries, at the artifact declaring it', async () => {
    const { config, snapshot } = await captureComposition({
      sourceFiles: { 'collections/core.md': '---\nskills:\n  - absent\n---\n\n# Core\n' },
      select: { collection: { use: [{ source: 'team' }] } },
      input: { edgeRules: [MEMBER_RULE] },
    });

    expect(validateComposition(config, snapshot).diagnostics).toStrictEqual([
      {
        domain: 'closure',
        diagnostic: {
          code: 'unknown-reference',
          message: expect.stringContaining('absent'),
          at: { artifactId: 'collection:core' },
        },
      },
    ]);
  });

  it('reports a directive that could not be resolved, at the line an author wrote it on', async () => {
    const { config, snapshot } = await captureComposition({
      sourceFiles: { 'skills/lint/SKILL.md': '# Lint\n\n<!-- include: ./gone.md /-->\n' },
      select: { skill: { use: [{ source: 'team' }] } },
    });

    expect(validateComposition(config, snapshot).diagnostics).toStrictEqual([
      {
        domain: 'transclusion',
        at: { targetId: 'claude', artifactId: 'skill:lint' },
        diagnostic: { code: 'not-found', message: expect.any(String), at: { path: 'skills/lint/SKILL.md', line: 3 } },
      },
    ]);
  });

  it('reports an unreadable inlay directive under its own domain, at the line of the body it landed in', async () => {
    const { config, snapshot } = await captureComposition({
      sourceFiles: { 'skills/lint/SKILL.md': '<!-- inlay: preferences -->\n<!-- inlay: preferences -->\n' },
      select: { skill: { use: [{ source: 'team' }] } },
      buildTargets: (targetRoot) => [buildInlayingTarget(targetRoot)],
    });

    expect(validateComposition(config, snapshot).diagnostics).toStrictEqual([
      {
        domain: 'inlay',
        at: { targetId: 'claude', artifactId: 'skill:lint' },
        diagnostic: { code: 'duplicate-name', message: expect.any(String), line: 2 },
      },
    ]);
  });

  it('reports a filler of a kind the target deploys nowhere, naming the inlay and the filler', async () => {
    const { config, snapshot } = await captureComposition({
      sourceFiles: {
        'skills/lint/SKILL.md': '# Lint\n<!-- inlay: preferences -->\n',
        'subagents/auditor.md': '# Auditor\n',
      },
      select: { skill: { use: [{ source: 'team' }] } },
      inlays: { preferences: { subagent: { use: ['auditor'] } } },
      buildTargets: (targetRoot) => [buildInlayingTarget(targetRoot)],
    });

    expect(validateComposition(config, snapshot).diagnostics).toStrictEqual([
      {
        domain: 'binding',
        diagnostic: {
          code: 'undeployed-kind',
          message: expect.any(String),
          at: { inlayName: 'preferences', targetId: 'claude', artifactId: 'subagent:auditor' },
        },
      },
    ]);
  });

  it('reports a filler whose own body declares an inlay, the render it ended carrying the fault', async () => {
    const { config, snapshot } = await captureComposition({
      sourceFiles: {
        'rulebooks/naming.md': 'Naming.\n<!-- inlay: deeper -->\n',
        'skills/lint/SKILL.md': '# Lint\n<!-- inlay: preferences -->\n',
      },
      select: { rulebook: { use: [{ source: 'team' }] }, skill: { use: [{ source: 'team' }] } },
      inlays: { preferences: { rulebook: { use: ['naming'] } } },
      buildTargets: (targetRoot) => [buildInlayingTarget(targetRoot)],
    });

    expect(validateComposition(config, snapshot).diagnostics).toStrictEqual([
      {
        domain: 'binding',
        diagnostic: {
          code: 'nested-inlay',
          message: expect.any(String),
          at: {
            inlayName: 'preferences',
            targetId: 'claude',
            hostArtifactId: 'skill:lint',
            artifactId: 'rulebook:naming',
          },
        },
      },
    ]);
  });

  // One run reports every mistake: the fill blocking a host does not take that host's own render faults with it.
  it('keeps a blocked host’s render diagnostics beside the binding fault that blocked it', async () => {
    const { config, snapshot } = await captureComposition({
      sourceFiles: {
        'rulebooks/naming.md': 'Naming.\n<!-- inlay: deeper -->\n',
        'skills/lint/SKILL.md': '# Lint\n\nSee [the rubric](../../../away.md).\n<!-- inlay: preferences -->\n',
      },
      select: { rulebook: { use: [{ source: 'team' }] }, skill: { use: [{ source: 'team' }] } },
      inlays: { preferences: { rulebook: { use: ['naming'] } } },
      buildTargets: (targetRoot) => [
        { ...buildInlayingTarget(targetRoot), stages: buildLinkingInlayStages(targetRoot) },
      ],
    });

    const { diagnostics } = validateComposition(config, snapshot);

    expect(diagnostics.map(({ domain }) => domain)).toStrictEqual(['render', 'binding']);
    expect(diagnostics.at(0)).toHaveProperty('diagnostic.diagnostic.code', 'out-of-tree');
    expect(diagnostics.at(1)).toHaveProperty('diagnostic.code', 'nested-inlay');
  });

  it('reports a binding whose inlay no artifact declares, once and at the config', async () => {
    const { config, snapshot } = await captureComposition({
      sourceFiles: {
        'rulebooks/naming.md': 'Naming.\n',
        'skills/lint/SKILL.md': '# Lint\n<!-- inlay: preferences -->\n',
      },
      select: { rulebook: { use: [{ source: 'team' }] }, skill: { use: [{ source: 'team' }] } },
      inlays: { prefrences: { rulebook: { use: ['naming'] } } },
      buildTargets: (targetRoot) => [buildInlayingTarget(targetRoot)],
    });

    expect(validateComposition(config, snapshot).diagnostics).toStrictEqual([
      {
        domain: 'binding',
        diagnostic: { code: 'unmatched-inlay', message: expect.any(String), at: { inlayName: 'prefrences' } },
      },
    ]);
  });

  it('locates a binding naming an artifact no source carries at the inlay it was written under', async () => {
    const { config, snapshot } = await captureComposition({
      sourceFiles: { 'skills/lint/SKILL.md': '# Lint\n<!-- inlay: preferences -->\n' },
      select: { skill: { use: [{ source: 'team' }] } },
      inlays: { preferences: { rulebook: { use: ['absent'] } } },
      buildTargets: (targetRoot) => [buildInlayingTarget(targetRoot)],
    });

    expect(validateComposition(config, snapshot).diagnostics).toStrictEqual([
      {
        domain: 'selection',
        diagnostic: {
          code: 'unknown-artifact',
          message: expect.any(String),
          at: { tierId: 'project', kindId: 'rulebook', inlayName: 'preferences', list: 'use', index: 0 },
        },
      },
    ]);
  });

  it('reports a token and a link that could not be rewritten, at the artifact hosting them', async () => {
    const { config, snapshot } = await captureComposition({
      sourceFiles: { 'skills/lint/SKILL.md': 'Use {tool:Write} on [the rubric](../../../outside.md).\n' },
      select: { skill: { use: [{ source: 'team' }] } },
      buildTargets: (targetRoot) => [buildRewritingTarget(targetRoot)],
      input: { tokenKinds: TOKEN_KINDS },
    });

    expect(validateComposition(config, snapshot).diagnostics).toStrictEqual([
      {
        domain: 'render',
        at: { targetId: 'claude', artifactId: 'skill:lint' },
        diagnostic: {
          stage: 'links',
          diagnostic: {
            code: 'out-of-tree',
            message: expect.any(String),
            at: expect.objectContaining({ host: 'skill:lint' }),
          },
        },
      },
      {
        domain: 'render',
        at: { targetId: 'claude', artifactId: 'skill:lint' },
        diagnostic: {
          stage: 'tokens',
          diagnostic: {
            code: 'unmapped-name',
            message: expect.any(String),
            at: expect.objectContaining({ host: 'skill:lint' }),
          },
        },
      },
    ]);
  });

  it('reports a destination two of a target’s tree deployments both write', async () => {
    const { config, snapshot } = await captureComposition({
      sourceFiles: {
        'rulebooks/naming.md': 'Name things well.\n',
        'skills/consult-naming/SKILL.md': '# Consult naming\n',
      },
      select: { rulebook: { use: [{ source: 'team' }] }, skill: { use: [{ source: 'team' }] } },
      buildTargets: buildOverlappingTargets,
    });

    expect(validateComposition(config, snapshot).diagnostics).toStrictEqual([
      {
        domain: 'deployment',
        diagnostic: {
          code: 'destination-collision',
          message: expect.stringContaining('undecidable'),
          at: {
            targetId: 'claude',
            path: 'skills/consult-naming/SKILL.md',
            kindIds: ['rulebook', 'skill'],
            artifactIds: ['rulebook:naming', 'skill:consult-naming'],
          },
        },
      },
    ]);
  });

  it('reports a tree destination landing on a region host, which the host itself never collides with', async () => {
    const { config, snapshot } = await captureComposition({
      sourceFiles: { 'rulebooks/naming.md': 'Name things well.\n', 'subagents/CLAUDE.md': '# Claude\n' },
      select: { rulebook: { use: [{ source: 'team' }] }, subagent: { use: [{ source: 'team' }] } },
      buildTargets: (targetRoot) => [buildHostCollidingTarget(targetRoot)],
    });

    expect(validateComposition(config, snapshot).diagnostics).toStrictEqual([
      {
        domain: 'deployment',
        diagnostic: {
          code: 'destination-collision',
          message: expect.stringContaining('undecidable'),
          at: {
            targetId: 'claude',
            path: HOST_PATH,
            kindIds: ['rulebook', 'subagent'],
            artifactIds: ['rulebook:naming', 'subagent:CLAUDE'],
          },
        },
      },
    ]);
  });

  it('reports two region deployments naming one host, which composing blocks and nothing refuses', async () => {
    const { config, snapshot } = await captureComposition({
      sourceFiles: { 'rulebooks/naming.md': 'Name things well.\n', 'subagents/auditor.md': '# Auditor\n' },
      select: { rulebook: { use: [{ source: 'team' }] }, subagent: { use: [{ source: 'team' }] } },
      buildTargets: (targetRoot) => [buildSharedHostTarget(targetRoot)],
    });

    expect(validateComposition(config, snapshot).diagnostics).toStrictEqual([
      {
        domain: 'deployment',
        diagnostic: {
          code: 'destination-collision',
          message: expect.stringContaining('"rulebook", "subagent"'),
          at: {
            targetId: 'claude',
            path: HOST_PATH,
            kindIds: ['rulebook', 'subagent'],
            artifactIds: ['rulebook:naming', 'subagent:auditor'],
          },
        },
      },
    ]);
  });

  it('orders collisions by target id, not by the order a config declared its targets in', async () => {
    const { config, snapshot } = await captureComposition({
      sourceFiles: {
        'rulebooks/naming.md': 'Name things well.\n',
        'skills/consult-naming/SKILL.md': '# Consult naming\n',
      },
      select: { rulebook: { use: [{ source: 'team' }] }, skill: { use: [{ source: 'team' }] } },
      buildTargets: (targetRoot) =>
        buildOverlappingTargets(targetRoot).flatMap((target) => [
          { ...target, id: 'zulu', label: 'Zulu' },
          { ...target, id: 'alpha', label: 'Alpha' },
        ]),
    });

    const { diagnostics } = validateComposition(config, snapshot);
    const collidingAt = diagnostics.flatMap((entry) =>
      entry.domain === 'deployment' ? [entry.diagnostic.at.targetId] : [],
    );

    expect(diagnostics.map(({ domain }) => domain)).toStrictEqual(['deployment', 'deployment']);
    expect(collidingAt).toStrictEqual(['alpha', 'zulu']);
  });

  it('reports the same faults whether or not the destination was scanned', async () => {
    const faulty: CaptureCompositionOptions = {
      sourceFiles: {
        'collections/core.md': '---\nskills:\n  - absent\n---\n\n# Core\n',
        'skills/lint/SKILL.md': '<!-- include: ./gone.md /-->\n',
      },
      select: { collection: { use: [{ source: 'team' }] }, skill: { use: [{ source: 'team' }] } },
      input: { edgeRules: [MEMBER_RULE] },
    };
    const scanned = await captureComposition(faulty);
    const unscanned = await captureComposition({ ...faulty, input: { ...faulty.input, shouldReadTargetState: false } });

    const report = validateComposition(unscanned.config, unscanned.snapshot);

    expect(report.diagnostics.map(({ domain }) => domain)).toStrictEqual(['closure', 'transclusion']);
    expect(report).toStrictEqual(validateComposition(scanned.config, scanned.snapshot));
  });

  it('leaves a fault in an artifact the config does not select to whoever selects it', async () => {
    const { config, snapshot } = await captureComposition({
      sourceFiles: {
        'rulebooks/naming.md': 'Name things well.\n',
        'skills/lint/SKILL.md': '<!-- include: ./gone.md /-->\n',
      },
      select: { rulebook: { use: [{ source: 'team' }] } },
    });

    expect(validateComposition(config, snapshot).diagnostics).toStrictEqual([]);
  });

  it('refuses a config whose adopted sources have moved away from the snapshot', async () => {
    const { snapshot } = await captureComposition();
    const remapped = buildConfig([{ id: 'project', sources: { use: [{ name: 'team', path: '/srv/elsewhere' }] } }]);

    expect(() => validateComposition(remapped, snapshot)).toThrow(StaleSnapshotError);
  });
});

// region | Helpers

/** Builds a target whose subagents deploy at its root, so one lands on the host its rulebooks aggregate into. */
function buildHostCollidingTarget(targetRoot: string): RenderTarget {
  const claude = buildClaudeTarget(targetRoot);

  return {
    ...claude,
    deployments: [
      ...claude.deployments.filter((deployment) => deployment.kindId === 'rulebook'),
      { form: 'tree', kindId: 'subagent', layout: { form: 'file', root: '', extension: '.md' } },
    ],
  };
}

/** Builds the inlaying target's stages with link rewriting added, so one body can carry a link fault and an inlay. */
function buildLinkingInlayStages(targetRoot: string): RenderTarget['stages'] {
  return [...buildInlayingTarget(targetRoot).stages, { kind: 'links', pattern: MARKDOWN_LINK }];
}

/** Builds a target that rewrites tokens and links, the two stages whose faults travel beside a rendered body. */
function buildRewritingTarget(targetRoot: string): RenderTarget {
  const claude = buildClaudeTarget(targetRoot);

  return {
    ...claude,
    tokenMappings: [{ kindId: 'tool', entries: [{ from: 'Read', to: 'view' }] }],
    stages: [...claude.stages, { kind: 'tokens' }, { kind: 'links', pattern: MARKDOWN_LINK }],
  };
}

/** Builds a target routing two kinds into one host, which composing blocks and no declaration check refuses. */
function buildSharedHostTarget(targetRoot: string): RenderTarget {
  const claude = buildClaudeTarget(targetRoot);

  return {
    ...claude,
    deployments: [
      ...claude.deployments.filter((deployment) => deployment.kindId === 'rulebook'),
      {
        form: 'region',
        kindId: 'subagent',
        host: HOST_PATH,
        markers: { open: '<!-- subagents -->', close: '<!-- /subagents -->' },
        contributionMarkers: CONTRIBUTION_MARKERS,
      },
    ],
  };
}

// endregion | Helpers
