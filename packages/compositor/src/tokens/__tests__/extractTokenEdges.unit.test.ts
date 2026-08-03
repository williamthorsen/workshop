import { describe, expect, it } from 'vitest';

import type { TokenKind } from '../../schemas/token-kind-schemas.ts';
import { extractTokenEdges } from '../extractTokenEdges.ts';

const invocation: TokenKind = {
  id: 'skill-invocation',
  label: 'Skill invocation',
  form: 'referent',
  pattern: String.raw`\{skill:([a-z][a-z0-9-]*)\}`,
  artifactKindId: 'skill',
};

const tool: TokenKind = { id: 'tool', label: 'Tool name', form: 'mapping', pattern: String.raw`\{tool:(\w+)\}` };

const kinds = [invocation, tool];

describe(extractTokenEdges, () => {
  it('reads a referent token in the host body as an edge carrying no partial', () => {
    const segments = [{ lines: ['Run {skill:review} first.'] }];

    expect(extractTokenEdges(segments, kinds)).toStrictEqual([{ to: 'skill:review', via: 'token' }]);
  });

  it('reads a referent token in a partial as an edge carrying that partial', () => {
    const segments = [{ lines: ['Run {skill:review} first.'], partialId: 'team:_data/shared.md' }];

    expect(extractTokenEdges(segments, kinds)).toStrictEqual([
      { to: 'skill:review', via: 'token', partialId: 'team:_data/shared.md' },
    ]);
  });

  it('reads a mapping token as no edge, since it names no artifact', () => {
    const segments = [{ lines: ['Use {tool:Read} to open it.'] }];

    expect(extractTokenEdges(segments, kinds)).toStrictEqual([]);
  });

  it('collapses one partial naming one referent twice into a single edge', () => {
    const segments = [{ lines: ['{skill:review}', 'and {skill:review} again'], partialId: 'team:_data/shared.md' }];

    expect(extractTokenEdges(segments, kinds)).toStrictEqual([
      { to: 'skill:review', via: 'token', partialId: 'team:_data/shared.md' },
    ]);
  });

  it('keeps one edge per partial naming a referent, since each is a distinct route to it', () => {
    const segments = [
      { lines: ['{skill:review}'], partialId: 'team:_data/one.md' },
      { lines: ['{skill:review}'], partialId: 'team:_data/two.md' },
      { lines: ['{skill:review}'] },
    ];

    expect(extractTokenEdges(segments, kinds)).toStrictEqual([
      { to: 'skill:review', via: 'token', partialId: 'team:_data/one.md' },
      { to: 'skill:review', via: 'token', partialId: 'team:_data/two.md' },
      { to: 'skill:review', via: 'token' },
    ]);
  });

  it('runs edges in segment order', () => {
    const segments = [{ lines: ['{skill:review}'] }, { lines: ['{skill:lint}'] }];

    expect(extractTokenEdges(segments, kinds).map(({ to }) => to)).toStrictEqual(['skill:review', 'skill:lint']);
  });

  it('reads no edges from a body whose tokens no kind declares', () => {
    expect(extractTokenEdges([{ lines: ['{rulebook:style}'] }], kinds)).toStrictEqual([]);
  });

  it('matches one line at a time, so an anchored pattern reaches every line of a segment', () => {
    const anchored: TokenKind = { ...invocation, pattern: String.raw`^\{skill:([a-z][a-z0-9-]*)\}` };
    const segments = [{ lines: ['{skill:review}', '{skill:lint}'] }];

    expect(extractTokenEdges(segments, [anchored]).map(({ to }) => to)).toStrictEqual(['skill:review', 'skill:lint']);
  });
});
