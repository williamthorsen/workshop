import { describe, expect, it } from 'vitest';

import type { EdgeRule, KindKeys } from '../../schemas/edge-rule-schemas.ts';
import type { DependencyEdge } from '../../schemas/graph-schemas.ts';
import { type FrontmatterEdges, type KindEdgeRules, readFrontmatterEdges } from '../readFrontmatterEdges.ts';

const kindKeys: KindKeys = { collections: 'collection', skills: 'skill', subagents: 'subagent' };

const declared: EdgeRule = { kindId: 'skill', key: 'dependencies', via: 'declared', form: 'kind-keyed' };
const injected: EdgeRule = { kindId: 'skill', key: 'skills', via: 'injected', form: 'flat', targetKindId: 'skill' };
const members: EdgeRule = {
  kindId: 'skill',
  key: 'members',
  via: 'member',
  form: 'kind-keyed',
  wildcard: { token: '@library', via: 'enumerated' },
};

describe(readFrontmatterEdges, () => {
  it('reads a kind-keyed block into one edge per slug, keyed by the kind its key names', () => {
    const content = block(['dependencies:', '  skills:', '    - lint', '  subagents:', '    - auditor']);

    expect(edgesOf(content)).toStrictEqual([
      { to: 'skill:lint', via: 'declared' },
      { to: 'subagent:auditor', via: 'declared' },
    ]);
  });

  it('reads a slug written as an object naming it, so an authored entry may carry other keys', () => {
    const content = block(['dependencies:', '  skills:', '    - name: lint', '      note: kept']);

    expect(edgesOf(content)).toStrictEqual([{ to: 'skill:lint', via: 'declared' }]);
  });

  it('reads a flat list into edges of the one kind its rule targets', () => {
    expect(edgesOf(block(['skills:', '  - lint']))).toStrictEqual([{ to: 'skill:lint', via: 'injected' }]);
  });

  it('expands a wildcard token into the artifacts the expansion names, under the wildcard origin', () => {
    expect(edgesOf(block(['members: "@library"']))).toStrictEqual([
      { to: 'skill:expanded', via: 'enumerated' },
      { to: 'subagent:expanded', via: 'enumerated' },
    ]);
  });

  it('expands nothing when no wildcard is written, so a rule admitting one costs nothing unused', () => {
    expect(edgesOf(block(['dependencies:', '  skills:', '    - lint']))).toStrictEqual([
      { to: 'skill:lint', via: 'declared' },
    ]);
  });

  it('reads one slug named twice under one key as the one edge it is', () => {
    const content = block(['dependencies:', '  skills:', '    - lint', '    - lint']);

    expect(edgesOf(content)).toStrictEqual([{ to: 'skill:lint', via: 'declared' }]);
  });

  it('keeps one slug reached under two keys as two edges, the origins being two facts', () => {
    const content = block(['dependencies:', '  skills:', '    - lint', 'skills:', '  - lint']);

    expect(edgesOf(content)).toStrictEqual([
      { to: 'skill:lint', via: 'declared' },
      { to: 'skill:lint', via: 'injected' },
    ]);
  });

  it('reads no edges from an artifact carrying no frontmatter, and faults nothing', () => {
    expect(readFrontmatterEdges(inputFor('# Lint\n'))).toStrictEqual({ edges: [], diagnostics: [] });
  });

  it('reads no edges from an empty block, an author having declared nothing rather than something wrong', () => {
    expect(readFrontmatterEdges(inputFor('---\n---\n'))).toStrictEqual({ edges: [], diagnostics: [] });
  });

  it('reads a key holding nothing as declaring nothing, which is every entry under it commented out', () => {
    expect(readFrontmatterEdges(inputFor(block(['dependencies:'])))).toStrictEqual({ edges: [], diagnostics: [] });
  });

  it('if a block is opened and never closed, faults the artifact, an author having meant to declare something', () => {
    expect(diagnosticsOf('---\ndependencies:\n')).toStrictEqual([
      {
        code: 'invalid-declaration',
        message: 'skill:review opens a frontmatter block that no delimiter closes.',
        at: { artifactId: 'skill:review' },
      },
    ]);
  });

  it('if a block is not valid YAML, faults the artifact', () => {
    expect(diagnosticsOf(block(['dependencies: [unclosed'])).map(({ code }) => code)).toStrictEqual([
      'invalid-declaration',
    ]);
  });

  it('if a kind-keyed value is neither a mapping nor a known token, faults the key', () => {
    expect(diagnosticsOf(block(['dependencies:', '  - lint']))).toStrictEqual([
      {
        code: 'invalid-declaration',
        message: 'skill:review holds neither a mapping of kind to slugs nor a known token.',
        at: { artifactId: 'skill:review', key: 'dependencies' },
      },
    ]);
  });

  it('if a token is written that no wildcard declares, faults the key rather than reading it as a slug', () => {
    expect(diagnosticsOf(block(['members: "@everything"']))).toStrictEqual([
      {
        code: 'invalid-declaration',
        message: 'skill:review holds "@everything", which is not a token this key recognizes.',
        at: { artifactId: 'skill:review', key: 'members' },
      },
    ]);
  });

  it('if a declaration key names no kind, faults it, its slugs naming nothing', () => {
    expect(diagnosticsOf(block(['dependencies:', '  rulebooks:', '    - style']))).toStrictEqual([
      {
        code: 'invalid-declaration',
        message: 'skill:review names no kind, so its slugs name nothing.',
        at: { artifactId: 'skill:review', key: 'dependencies.rulebooks' },
      },
    ]);
  });

  it('if a slug list holds something other than slugs, faults the key it sits under', () => {
    expect(diagnosticsOf(block(['dependencies:', '  skills: lint']))).toStrictEqual([
      {
        code: 'invalid-declaration',
        message: 'skill:review holds something other than a list of slugs.',
        at: { artifactId: 'skill:review', key: 'dependencies.skills' },
      },
    ]);
  });

  it('if a key another kind owns is carried, faults it, nothing here reading it as an edge', () => {
    const rules: KindEdgeRules = { rules: [declared], foreignKeys: new Set(['members']) };
    const content = block(['members:', '  skills:', '    - lint']);

    expect(readFrontmatterEdges(inputFor(content, rules)).diagnostics).toStrictEqual([
      {
        code: 'misplaced-key',
        message: 'skill:review belongs to another kind, so nothing here reads it as an edge.',
        at: { artifactId: 'skill:review', key: 'members' },
      },
    ]);
  });

  it('leaves a key no rule anywhere owns unremarked, which is ordinary metadata', () => {
    expect(diagnosticsOf(block(['description: Reviews a diff']))).toStrictEqual([]);
  });

  it('keeps a self-dependency an author declared, which a cycle diagnostic is what answers', () => {
    expect(edgesOf(block(['dependencies:', '  skills:', '    - review']))).toStrictEqual([
      { to: 'skill:review', via: 'declared' },
    ]);
  });
});

// region | Helpers

/** Wraps `lines` in a frontmatter block above a body. */
function block(lines: ReadonlyArray<string>): string {
  return ['---', ...lines, '---', '', '# Review', ''].join('\n');
}

/** Reads `content` and returns the faults it raised. */
function diagnosticsOf(content: string): FrontmatterEdges['diagnostics'] {
  return readFrontmatterEdges(inputFor(content)).diagnostics;
}

/** Reads `content` and returns the edges it declared. */
function edgesOf(content: string): ReadonlyArray<DependencyEdge> {
  return readFrontmatterEdges(inputFor(content)).edges;
}

/** Builds the input for one read, under every rule unless `kindRules` narrows them. */
function inputFor(content: string, kindRules?: KindEdgeRules): Parameters<typeof readFrontmatterEdges>[0] {
  return {
    artifactId: 'skill:review',
    content,
    kindKeys,
    kindRules: kindRules ?? { rules: [declared, injected, members], foreignKeys: new Set() },
    expand: () => ['skill:expanded', 'subagent:expanded'],
  };
}

// endregion | Helpers
