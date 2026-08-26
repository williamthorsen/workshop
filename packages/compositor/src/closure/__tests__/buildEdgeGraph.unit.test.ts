import { describe, expect, it } from 'vitest';

import type { Catalog } from '../../schemas/catalog-schemas.ts';
import type { EdgeRule, KindKeys } from '../../schemas/edge-rule-schemas.ts';
import { requireEntry } from '../../test-utils/requireEntry.ts';
import { EdgeRuleConsistencyError } from '../assertEdgeRulesAreConsistent.ts';
import { buildEdgeGraph } from '../buildEdgeGraph.ts';
import type { ArtifactRead, EdgeContribution } from '../EdgeContributor.ts';
import { buildSourceCatalog } from '../test-utils/buildSourceCatalog.ts';

const kindKeys: KindKeys = { collections: 'collection', skills: 'skill', subagents: 'subagent' };

const rules: ReadonlyArray<EdgeRule> = [
  {
    kindId: 'collection',
    key: 'members',
    via: 'member',
    form: 'kind-keyed',
    wildcard: { token: '@library', via: 'enumerated' },
  },
  { kindId: 'skill', key: 'dependencies', via: 'declared', form: 'kind-keyed' },
  { kindId: 'subagent', key: 'dependencies', via: 'declared', form: 'kind-keyed' },
  { kindId: 'subagent', key: 'skills', via: 'injected', form: 'flat', targetKindId: 'skill' },
];

describe(buildEdgeGraph, () => {
  it('reads every artifact the catalog contains, whichever kind layout holds it', async () => {
    const graph = await buildEdgeGraph({ catalog: await buildCatalog(), rules, kindKeys });

    expect([...graph.edges]).toStrictEqual([
      [
        'collection:core',
        [
          { to: 'skill:review', via: 'member' },
          { to: 'subagent:auditor', via: 'member' },
        ],
      ],
      ['skill:review', [{ to: 'skill:lint', via: 'declared' }]],
      ['subagent:auditor', [{ to: 'skill:lint', via: 'injected' }]],
    ]);
  });

  it('has no entry for an artifact declaring nothing, an absent key and an empty list being one fact', async () => {
    const graph = await buildEdgeGraph({ catalog: await buildCatalog(), rules, kindKeys });

    expect(graph.edges.has('skill:lint')).toBe(false);
  });

  it('expands a wildcard over the source that won the aggregate, not over one that lost it', async () => {
    const catalog = await buildSourceCatalog([
      { id: 'team', files: { 'collections/all.md': frontmatter(['members: "@library"']) } },
      {
        id: 'library',
        files: { 'skills/lint/SKILL.md': '# Lint\n', 'collections/all.md': frontmatter(['members: "@library"']) },
      },
    ]);
    const graph = await buildEdgeGraph({ catalog, rules, kindKeys });

    // `team` wins the aggregate and contains nothing that emits; the skill belongs to the copy that lost.
    expect(graph.edges.has('collection:all')).toBe(false);
  });

  it('expands a wildcard to the emitting artifacts of the source that won the aggregate', async () => {
    const catalog = await buildSourceCatalog([
      {
        id: 'team',
        files: {
          'collections/all.md': frontmatter(['members: "@library"']),
          'skills/lint/SKILL.md': '# Lint\n',
          'subagents/auditor.md': '# Auditor\n',
        },
      },
    ]);
    const graph = await buildEdgeGraph({ catalog, rules, kindKeys });

    expect(graph.edges.get('collection:all')).toStrictEqual([
      { to: 'skill:lint', via: 'enumerated' },
      { to: 'subagent:auditor', via: 'enumerated' },
    ]);
  });

  it('keeps the edges and partials a contributor supplies, so a body reaches the closure', async () => {
    const graph = await buildEdgeGraph({
      catalog: await buildCatalog(),
      rules,
      kindKeys,
      contributeEdges: contributeFor('skill:review', {
        edges: [{ to: 'subagent:auditor', via: 'token', partialId: 'team:_data/shared.md' }],
        partials: [{ id: 'team:_data/shared.md', sourceId: 'team', path: '_data/shared.md', hash: 'hash:shared' }],
      }),
    });

    expect(graph.edges.get('skill:review')).toStrictEqual([
      { to: 'skill:lint', via: 'declared' },
      { to: 'subagent:auditor', via: 'token', partialId: 'team:_data/shared.md' },
    ]);
    expect(graph.partials.map(({ id }) => id)).toStrictEqual(['team:_data/shared.md']);
  });

  it('hands the contributor the source and path an expansion resolves within', async () => {
    const reads: Array<ArtifactRead> = [];
    const catalog = await buildCatalog();
    await buildEdgeGraph({
      catalog,
      rules,
      kindKeys,
      contributeEdges: (read) => {
        reads.push(read);
        return { edges: [], partials: [] };
      },
    });

    const review = reads.find(({ artifactId }) => artifactId === 'skill:review');
    expect(review?.path).toBe('skills/review/SKILL.md');
    expect(review?.source.dir).toBe(catalog.sources.find(({ id }) => id === 'team')?.dir);
    expect(review?.content).toContain('dependencies:');
  });

  it('drops a contributed token edge naming its own artifact, which renders but does not depend', async () => {
    const graph = await buildEdgeGraph({
      catalog: await buildCatalog(),
      rules,
      kindKeys,
      contributeEdges: contributeFor('skill:lint', {
        edges: [
          { to: 'skill:lint', via: 'token' },
          { to: 'skill:review', via: 'token' },
        ],
        partials: [],
      }),
    });

    expect(graph.edges.get('skill:lint')).toStrictEqual([{ to: 'skill:review', via: 'token' }]);
  });

  it('reports content faults in catalog order, so two runs over one tree report identically', async () => {
    const catalog = await buildSourceCatalog([
      {
        id: 'team',
        files: {
          'skills/broken/SKILL.md': frontmatter(['dependencies: [lint]']),
          'subagents/stray.md': frontmatter(['members:', '  skills:', '    - lint']),
        },
      },
    ]);
    const graph = await buildEdgeGraph({ catalog, rules, kindKeys });

    expect(graph.diagnostics.map(({ code, at }) => [code, at.artifactId])).toStrictEqual([
      ['invalid-declaration', 'skill:broken'],
      ['misplaced-key', 'subagent:stray'],
    ]);
  });

  it('if the rules contradict themselves, fails the call rather than reading a smaller graph', async () => {
    const catalog = await buildCatalog();
    const broken: ReadonlyArray<EdgeRule> = [{ ...requireEntry(rules, 1), kindId: 'rulebook' }];

    await expect(buildEdgeGraph({ catalog, rules: broken, kindKeys })).rejects.toThrow(EdgeRuleConsistencyError);
  });

  it('reads frontmatter alone when no contributor is supplied', async () => {
    const graph = await buildEdgeGraph({ catalog: await buildCatalog(), rules, kindKeys });

    expect(graph.partials).toStrictEqual([]);
  });
});

// region | Helpers

/** Builds the catalog the wiring tests read: two sources, every kind layout, and a diamond through the aggregate. */
async function buildCatalog(): Promise<Catalog> {
  return buildSourceCatalog([
    {
      id: 'team',
      files: {
        'collections/core.md': frontmatter(['members:', '  skills:', '    - review', '  subagents:', '    - auditor']),
        'skills/review/SKILL.md': frontmatter(['dependencies:', '  skills:', '    - lint']),
        'subagents/auditor.md': frontmatter(['skills:', '  - lint']),
      },
    },
    { id: 'library', files: { 'skills/lint/SKILL.md': '# Lint\n' } },
  ]);
}

/** Contributes `contribution` for one artifact and an empty contribution for every other. */
function contributeFor(artifactId: string, contribution: EdgeContribution): (read: ArtifactRead) => EdgeContribution {
  return (read: ArtifactRead): EdgeContribution =>
    read.artifactId === artifactId ? contribution : { edges: [], partials: [] };
}

/** Wraps `lines` in a frontmatter block above a body. */
function frontmatter(lines: ReadonlyArray<string>): string {
  return ['---', ...lines, '---', '', '# Artifact', ''].join('\n');
}

// endregion | Helpers
