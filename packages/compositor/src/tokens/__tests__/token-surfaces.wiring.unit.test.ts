import { describe, expect, it } from 'vitest';

import type { TargetEntry } from '../../schemas/target-schemas.ts';
import type { TokenKind } from '../../schemas/token-kind-schemas.ts';
import type { Segment } from '../../transclusion/expandTransclusions.ts';
import { extractTokenEdges } from '../extractTokenEdges.ts';
import { rewriteTokens } from '../rewriteTokens.ts';

const claude: TargetEntry = {
  id: 'claude',
  label: 'Claude',
  root: '~/.claude',
  tokenMappings: [{ kindId: 'skill-invocation', entries: [], sigil: '/' }],
};

const segments: ReadonlyArray<Segment> = [
  { lines: ['{skill:review}', '{skill:lint}'] },
  { lines: ['{skill:format}'], partialId: 'team:_data/shared.md' },
];

// A pattern spanning the whole of what each surface feeds it: an anchor matches differently against one line than
// against a segment's lines joined, so it is the shape that separates the two surfaces if they ever diverge again.
const anchored: TokenKind = {
  id: 'skill-invocation',
  label: 'Skill invocation',
  form: 'referent',
  pattern: String.raw`^\{skill:([a-z][a-z0-9-]*)\}`,
  artifactKindId: 'skill',
};

const unanchored: TokenKind = { ...anchored, pattern: String.raw`\{skill:([a-z][a-z0-9-]*)\}` };

describe('token surfaces', () => {
  it.each([
    ['an anchored pattern', anchored],
    ['an unanchored pattern', unanchored],
  ])('extracts an edge for every referent %s renders', (_label, kind) => {
    const edges = extractTokenEdges(segments, [kind]);
    const rendered = rewriteTokens({
      segments,
      tokenKinds: [kind],
      target: claude,
      host: 'skill:host',
      resolveDeployedName: (_targetId, artifactId) => artifactId.replace('skill:', ''),
    });

    const renderedSlugs = rendered.segments.flatMap((segment) =>
      segment.lines.flatMap((line) =>
        line
          .matchAll(/\/([a-z][a-z0-9-]*)/g)
          .map((match) => match[1])
          .toArray(),
      ),
    );

    expect(edges.map((edge) => edge.to.replace('skill:', ''))).toStrictEqual(renderedSlugs);
  });
});
