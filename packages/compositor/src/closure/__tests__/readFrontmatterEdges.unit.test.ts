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
    const content = wrapInFrontmatter(['dependencies:', '  skills:', '    - lint', '  subagents:', '    - auditor']);

    expect(readEdges(content)).toStrictEqual([
      { to: 'skill:lint', via: 'declared' },
      { to: 'subagent:auditor', via: 'declared' },
    ]);
  });

  it('reads a slug written as an object naming it, so an authored entry may have other keys', () => {
    const content = wrapInFrontmatter(['dependencies:', '  skills:', '    - name: lint', '      note: kept']);

    expect(readEdges(content)).toStrictEqual([{ to: 'skill:lint', via: 'declared' }]);
  });

  it('reads a flat list into edges of the one kind its rule targets', () => {
    expect(readEdges(wrapInFrontmatter(['skills:', '  - lint']))).toStrictEqual([
      { to: 'skill:lint', via: 'injected' },
    ]);
  });

  it('expands a wildcard token into the artifacts the expansion names, under the wildcard origin', () => {
    expect(readEdges(wrapInFrontmatter(['members: "@library"']))).toStrictEqual([
      { to: 'skill:expanded', via: 'enumerated' },
      { to: 'subagent:expanded', via: 'enumerated' },
    ]);
  });

  it('expands nothing when no wildcard is written, so a rule admitting one does nothing until an artifact writes it', () => {
    expect(readEdges(wrapInFrontmatter(['dependencies:', '  skills:', '    - lint']))).toStrictEqual([
      { to: 'skill:lint', via: 'declared' },
    ]);
  });

  it('reads one slug named twice under one key as the one edge it is', () => {
    const content = wrapInFrontmatter(['dependencies:', '  skills:', '    - lint', '    - lint']);

    expect(readEdges(content)).toStrictEqual([{ to: 'skill:lint', via: 'declared' }]);
  });

  it('keeps one slug reached under two keys as two edges, the origins being two facts', () => {
    const content = wrapInFrontmatter(['dependencies:', '  skills:', '    - lint', 'skills:', '  - lint']);

    expect(readEdges(content)).toStrictEqual([
      { to: 'skill:lint', via: 'declared' },
      { to: 'skill:lint', via: 'injected' },
    ]);
  });

  it('reads no edges and no faults from an artifact with no frontmatter', () => {
    expect(readFrontmatterEdges(buildInput('# Lint\n'))).toStrictEqual({ edges: [], diagnostics: [] });
  });

  it('reads no edges from an empty block, an author having declared nothing rather than something wrong', () => {
    expect(readFrontmatterEdges(buildInput('---\n---\n'))).toStrictEqual({ edges: [], diagnostics: [] });
  });

  it('reads a key holding nothing as declaring nothing, which is every entry under it commented out', () => {
    expect(readFrontmatterEdges(buildInput(wrapInFrontmatter(['dependencies:'])))).toStrictEqual({
      edges: [],
      diagnostics: [],
    });
  });

  it('if a block is opened and never closed, faults the artifact, an author having meant to declare something', () => {
    expect(readDiagnostics('---\ndependencies:\n')).toStrictEqual([
      {
        code: 'invalid-declaration',
        message: expect.any(String),
        at: { artifactId: 'skill:review' },
      },
    ]);
  });

  it('if a block is not valid YAML, faults the artifact', () => {
    expect(readDiagnostics(wrapInFrontmatter(['dependencies: [unclosed'])).map(({ code }) => code)).toStrictEqual([
      'invalid-declaration',
    ]);
  });

  it('if a kind-keyed value is neither a mapping nor a known token, faults the key', () => {
    expect(readDiagnostics(wrapInFrontmatter(['dependencies:', '  - lint']))).toStrictEqual([
      {
        code: 'invalid-declaration',
        message: expect.stringContaining('neither a mapping'),
        at: { artifactId: 'skill:review', key: 'dependencies' },
      },
    ]);
  });

  it('if a token is written that no wildcard declares, faults the key rather than reading it as a slug', () => {
    expect(readDiagnostics(wrapInFrontmatter(['members: "@everything"']))).toStrictEqual([
      {
        code: 'invalid-declaration',
        message: expect.stringContaining('"@everything"'),
        at: { artifactId: 'skill:review', key: 'members' },
      },
    ]);
  });

  it('if a declaration key names no kind, faults it, its slugs naming nothing', () => {
    expect(readDiagnostics(wrapInFrontmatter(['dependencies:', '  rulebooks:', '    - style']))).toStrictEqual([
      {
        code: 'invalid-declaration',
        message: expect.stringContaining('names no kind'),
        at: { artifactId: 'skill:review', key: 'dependencies.rulebooks' },
      },
    ]);
  });

  it('if a slug list holds something other than slugs, faults the key it sits under', () => {
    expect(readDiagnostics(wrapInFrontmatter(['dependencies:', '  skills: lint']))).toStrictEqual([
      {
        code: 'invalid-declaration',
        message: expect.stringContaining('list of slugs'),
        at: { artifactId: 'skill:review', key: 'dependencies.skills' },
      },
    ]);
  });

  it('if a key another kind owns is present, faults it, nothing here reading it as an edge', () => {
    const rules: KindEdgeRules = { rules: [declared], foreignKeys: new Set(['members']) };
    const content = wrapInFrontmatter(['members:', '  skills:', '    - lint']);

    expect(readFrontmatterEdges(buildInput(content, rules)).diagnostics).toStrictEqual([
      {
        code: 'misplaced-key',
        message: expect.any(String),
        at: { artifactId: 'skill:review', key: 'members' },
      },
    ]);
  });

  it('leaves a key no rule anywhere owns unremarked, which is ordinary metadata', () => {
    expect(readDiagnostics(wrapInFrontmatter(['description: Reviews a diff']))).toStrictEqual([]);
  });

  it('if a declaration key names an inherited member, faults it as the unknown kind it is', () => {
    expect(readDiagnostics(wrapInFrontmatter(['dependencies:', '  constructor:', '    - lint']))).toStrictEqual([
      {
        code: 'invalid-declaration',
        message: expect.stringContaining('names no kind'),
        at: { artifactId: 'skill:review', key: 'dependencies.constructor' },
      },
    ]);
  });

  it('reads no edges from a rule key an artifact did not write, whatever a prototype returns for it', () => {
    const rules: KindEdgeRules = {
      rules: [{ ...declared, key: 'toString' }],
      foreignKeys: new Set(),
    };

    expect(readFrontmatterEdges(buildInput(wrapInFrontmatter(['description: Reviews a diff']), rules))).toStrictEqual({
      edges: [],
      diagnostics: [],
    });
  });

  it('keeps a self-dependency an author declared, which a cycle diagnostic is what reports', () => {
    expect(readEdges(wrapInFrontmatter(['dependencies:', '  skills:', '    - review']))).toStrictEqual([
      { to: 'skill:review', via: 'declared' },
    ]);
  });
});

// region | Helpers

/** Builds the input for one read, under every rule unless `kindRules` narrows them. */
function buildInput(content: string, kindRules?: KindEdgeRules): Parameters<typeof readFrontmatterEdges>[0] {
  return {
    artifactId: 'skill:review',
    content,
    kindKeys,
    kindRules: kindRules ?? { rules: [declared, injected, members], foreignKeys: new Set() },
    expand: () => ['skill:expanded', 'subagent:expanded'],
  };
}

/** Reads `content` and returns the faults it raised. */
function readDiagnostics(content: string): FrontmatterEdges['diagnostics'] {
  return readFrontmatterEdges(buildInput(content)).diagnostics;
}

/** Reads `content` and returns the edges it declared. */
function readEdges(content: string): ReadonlyArray<DependencyEdge> {
  return readFrontmatterEdges(buildInput(content)).edges;
}

/** Wraps `lines` in a frontmatter block above a body. */
function wrapInFrontmatter(lines: ReadonlyArray<string>): string {
  return ['---', ...lines, '---', '', '# Review', ''].join('\n');
}

// endregion | Helpers
