import { describe, expect, it } from 'vitest';

import type { TargetEntry } from '../../schemas/target-schemas.ts';
import type { TokenKind } from '../../schemas/token-kind-schemas.ts';
import { joinSegments } from '../../test-utils/joinSegments.ts';
import type { Segment } from '../../transclusion/expandTransclusions.ts';
import type { DeployedNameLookup, TokenRewrite } from '../rewriteTokens.ts';
import { rewriteTokens } from '../rewriteTokens.ts';

const invocation: TokenKind = {
  id: 'skill-invocation',
  label: 'Skill invocation',
  form: 'referent',
  pattern: String.raw`\{skill:([a-z][a-z0-9-]*)\}`,
  artifactKindId: 'skill',
};

const tool: TokenKind = { id: 'tool', label: 'Tool name', form: 'mapping', pattern: String.raw`\{tool:(\w+)\}` };

const claude: TargetEntry = {
  id: 'claude',
  label: 'Claude',
  root: '~/.claude',
  tokenMappings: [
    { kindId: 'skill-invocation', entries: [], sigil: '/' },
    { kindId: 'tool', entries: [{ from: 'Read', to: 'view' }] },
  ],
  variables: [],
};

/** Deploys every skill under its own slug, which is the case a token rendering its own name is the degenerate form of. */
const deploysEverySkill: DeployedNameLookup = (_targetId, artifactId) => artifactId.replace('skill:', '');

describe(rewriteTokens, () => {
  it('renders a mapping token as the name the target maps it to', () => {
    const result = rewrite([{ lines: ['Use {tool:Read} to open it.'] }]);

    expect(joinSegments(result.segments)).toBe('Use view to open it.');
    expect(result.diagnostics).toStrictEqual([]);
  });

  it('renders a referent token as the sigil and the name its artifact deploys under', () => {
    const result = rewrite([{ lines: ['Run {skill:review} first.'] }]);

    expect(joinSegments(result.segments)).toBe('Run /review first.');
  });

  it('renders a referent whose deployed name differs from its slug under the deployed name', () => {
    const result = rewrite([{ lines: ['Run {skill:review} first.'] }], () => 'code-review');

    expect(joinSegments(result.segments)).toBe('Run /code-review first.');
  });

  it('passes text carrying no token through unchanged', () => {
    const result = rewrite([{ lines: ['# Review', '', 'Read the diff.'] }]);

    expect(joinSegments(result.segments)).toBe('# Review\n\nRead the diff.');
  });

  it('keeps each segment attributed to the file its lines came from', () => {
    const result = rewrite([
      { lines: ['Run {skill:review}.'] },
      { lines: ['Use {tool:Read}.'], partialId: 'team:_data/shared.md' },
    ]);

    expect(result.segments).toStrictEqual([
      { lines: ['Run /review.'] },
      { lines: ['Use view.'], partialId: 'team:_data/shared.md' },
    ]);
  });

  it('if a mapping token names something the target does not map, reports it and keeps the token', () => {
    const result = rewrite([{ lines: ['Use {tool:Bash} to run it.'] }]);

    expect(joinSegments(result.segments)).toBe('Use {tool:Bash} to run it.');
    expect(result.diagnostics).toStrictEqual([
      {
        code: 'unmapped-name',
        message: 'The token {tool:Bash} in skill:review names "Bash", which Claude does not map.',
        at: { host: 'skill:review', token: '{tool:Bash}' },
      },
    ]);
  });

  it('if a referent does not deploy to the target, reports it and keeps the token', () => {
    const result = rewrite([{ lines: ['Run {skill:absent}.'] }], () => undefined);

    expect(joinSegments(result.segments)).toBe('Run {skill:absent}.');
    expect(result.diagnostics.map(({ code }) => code)).toStrictEqual(['undeployed-referent']);
  });

  it('reports a token that arrived through a partial against that partial', () => {
    const result = rewrite([{ lines: ['Use {tool:Bash}.'], partialId: 'team:_data/shared.md' }]);

    expect(result.diagnostics.map(({ at }) => at)).toStrictEqual([
      { host: 'skill:review', token: '{tool:Bash}', partialId: 'team:_data/shared.md' },
    ]);
  });

  it('reports every token it could not render, not only the first', () => {
    const result = rewrite([{ lines: ['{tool:Bash} and {tool:Grep}', 'then {tool:Glob}'] }]);

    expect(result.diagnostics.map(({ at }) => at.token)).toStrictEqual(['{tool:Bash}', '{tool:Grep}', '{tool:Glob}']);
  });

  it('renders several tokens in one line, leaving the text between them untouched', () => {
    const result = rewrite([{ lines: ['Run {skill:review}, then {tool:Read} it.'] }]);

    expect(joinSegments(result.segments)).toBe('Run /review, then view it.');
  });

  it('renders no token for a target declaring no mapping for the kind, since it supplies no sigil either', () => {
    const bare: TargetEntry = { ...claude, tokenMappings: [] };
    const result = rewriteTokens({
      segments: [{ lines: ['Run {skill:review}.'] }],
      tokenKinds: [invocation, tool],
      target: bare,
      host: 'skill:review',
      resolveDeployedName: deploysEverySkill,
    });

    expect(joinSegments(result.segments)).toBe('Run review.');
  });
});

// region | Helpers

/** Rewrites for the Claude target, which maps `Read` and prefixes skill invocations with a slash. */
function rewrite(segments: ReadonlyArray<Segment>, resolveDeployedName = deploysEverySkill): TokenRewrite {
  return rewriteTokens({
    segments,
    tokenKinds: [invocation, tool],
    target: claude,
    host: 'skill:review',
    resolveDeployedName,
  });
}

// endregion | Helpers
