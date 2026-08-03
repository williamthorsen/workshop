import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { findIssuePaths } from '../test-utils/findIssuePaths.ts';
import { TokenKindSchema } from '../token-kind-schemas.ts';

const mapping = { id: 'tool', label: 'Tool name', form: 'mapping', pattern: String.raw`\{tool:([a-z]+)\}` };
const referent = {
  id: 'skill-invocation',
  label: 'Skill invocation',
  form: 'referent',
  pattern: String.raw`\{skill:([a-z][a-z0-9-]*)\}`,
  artifactKindId: 'skill',
};

describe('TokenKindSchema', () => {
  it('accepts a kind resolved through the target mapping table', () => {
    expect(TokenKindSchema.parse(mapping)).toStrictEqual(mapping);
  });

  it('accepts a kind naming the artifact kind its capture refers to', () => {
    expect(TokenKindSchema.parse(referent)).toStrictEqual(referent);
  });

  it('if the resolution form is outside the known set, rejects the kind for that field', () => {
    expect(findIssuePaths(TokenKindSchema, { ...mapping, form: 'variable' })).toStrictEqual([['form']]);
  });

  it('if a referent names no artifact kind, rejects it for that field', () => {
    const { artifactKindId: _dropped, ...incomplete } = referent;

    expect(findIssuePaths(TokenKindSchema, incomplete)).toStrictEqual([['artifactKindId']]);
  });

  it('carries the descriptor fields a plan records, so one declaration serves both', () => {
    expect(findIssuePaths(TokenKindSchema, { form: 'mapping', pattern: '(x)' })).toStrictEqual([['id'], ['label']]);
  });

  // Objects stay open so a consumer pinned to this version accepts a payload carrying a field added later.
  it('accepts a kind carrying an unrecognized key, and strips it', () => {
    expect(TokenKindSchema.parse({ ...mapping, addedLater: 'ignored' })).toStrictEqual(mapping);
  });

  it('renders both forms to JSON Schema, so a published document describes what this package accepts', () => {
    expect(z.toJSONSchema(TokenKindSchema).$defs).toHaveProperty(['MappingTokenKind']);
    expect(z.toJSONSchema(TokenKindSchema).$defs).toHaveProperty(['ReferentTokenKind']);
  });
});
