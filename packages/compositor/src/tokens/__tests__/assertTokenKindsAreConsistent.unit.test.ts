import { captureError } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import type { KindDescriptor } from '../../schemas/descriptor-schemas.ts';
import type { TokenKind } from '../../schemas/token-kind-schemas.ts';
import { assertTokenKindsAreConsistent, TokenKindConsistencyError } from '../assertTokenKindsAreConsistent.ts';

const kinds: ReadonlyArray<KindDescriptor> = [{ id: 'skill', label: 'Skill', emitsFiles: true }];

const mapping: TokenKind = { id: 'tool', label: 'Tool name', form: 'mapping', pattern: String.raw`\{tool:(\w+)\}` };
const referent: TokenKind = {
  id: 'skill-invocation',
  label: 'Skill invocation',
  form: 'referent',
  pattern: String.raw`\{skill:([a-z][a-z0-9-]*)\}`,
  artifactKindId: 'skill',
};

describe(assertTokenKindsAreConsistent, () => {
  it('accepts declarations that compile, capture one group, and name a known artifact kind', () => {
    expect(() => assertTokenKindsAreConsistent([mapping, referent], kinds)).not.toThrow();
  });

  it('accepts no declarations at all', () => {
    expect(() => assertTokenKindsAreConsistent([], kinds)).not.toThrow();
  });

  it('if a pattern does not compile, faults it', async () => {
    const broken: TokenKind = { ...mapping, pattern: '([a-z' };

    await expect(violationsOf([broken])).resolves.toStrictEqual([
      { path: 'tokenKinds[0].pattern', message: 'is not a valid regular expression' },
    ]);
  });

  it('if a pattern captures nothing, faults it, since a match would name no token', async () => {
    const uncaptured: TokenKind = { ...mapping, pattern: String.raw`\{tool:\w+\}` };

    await expect(violationsOf([uncaptured])).resolves.toStrictEqual([
      { path: 'tokenKinds[0].pattern', message: 'captures 0 groups, but exactly one names the token' },
    ]);
  });

  it('if a pattern captures several groups, faults it, since none of them is the name', async () => {
    const overcaptured: TokenKind = { ...mapping, pattern: String.raw`\{(tool):(\w+)\}` };

    await expect(violationsOf([overcaptured])).resolves.toStrictEqual([
      { path: 'tokenKinds[0].pattern', message: 'captures 2 groups, but exactly one names the token' },
    ]);
  });

  it('if a referent names an artifact kind no descriptor carries, faults it', async () => {
    const dangling: TokenKind = { ...referent, artifactKindId: 'rulebook' };

    await expect(violationsOf([dangling])).resolves.toStrictEqual([
      { path: 'tokenKinds[0].artifactKindId', message: 'references "rulebook", which is not an entry in kinds' },
    ]);
  });

  it('if one id is declared twice, faults the repeat, which would make every mapping against it ambiguous', async () => {
    await expect(violationsOf([mapping, { ...mapping, pattern: String.raw`\[tool:(\w+)\]` }])).resolves.toStrictEqual([
      { path: 'tokenKinds', message: 'carries "tool" more than once' },
    ]);
  });

  it('reports every fault in one run', async () => {
    const broken: TokenKind = { ...mapping, pattern: '([a-z' };
    const dangling: TokenKind = { ...referent, artifactKindId: 'rulebook' };

    expect((await violationsOf([broken, dangling])).map(({ path }) => path)).toStrictEqual([
      'tokenKinds[0].pattern',
      'tokenKinds[1].artifactKindId',
    ]);
  });
});

// region | Helpers

/** Runs the assertion and returns the violations it raised, failing the test when it raised none. */
async function violationsOf(
  tokenKinds: ReadonlyArray<TokenKind>,
): Promise<ReadonlyArray<{ path: string; message: string }>> {
  return (await captureError(TokenKindConsistencyError, () => assertTokenKindsAreConsistent(tokenKinds, kinds)))
    .violations;
}

// endregion | Helpers
