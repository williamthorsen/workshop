import { describe, expect, it } from 'vitest';

import { TargetEntrySchema, TokenMappingSchema } from '../target-schemas.ts';
import { findIssuePaths } from '../test-utils/findIssuePaths.ts';

const target = { id: 'claude', label: 'Claude', root: '~/.claude', tokenMappings: [] };

describe('TargetEntrySchema', () => {
  it('accepts a target declaring no token mappings', () => {
    expect(TargetEntrySchema.parse(target)).toStrictEqual(target);
  });

  it('accepts a target naming the directories it holds independently of the composition', () => {
    const withContainers = { ...target, containerDirs: ['skills', 'subagents'] };

    expect(TargetEntrySchema.parse(withContainers)).toStrictEqual(withContainers);
  });

  it('accepts a target naming no container directory, an older plan stating none', () => {
    expect(TargetEntrySchema.parse(target)).not.toHaveProperty('containerDirs');
  });

  it('if tokenMappings is absent, rejects the target for that field', () => {
    const withoutMappings = { id: 'claude', label: 'Claude', root: '~/.claude' };

    expect(findIssuePaths(TargetEntrySchema, withoutMappings)).toStrictEqual([['tokenMappings']]);
  });

  // Objects stay open so a consumer pinned to this version accepts a payload containing a field added later.
  it('accepts a target containing an unrecognized key, and strips it', () => {
    expect(TargetEntrySchema.parse({ ...target, addedLater: 'ignored' })).toStrictEqual(target);
  });
});

describe('TokenMappingSchema', () => {
  it('accepts a mapping containing the sigil its rendered names are prefixed with', () => {
    const withSigil = { kindId: 'skill-invocation', entries: [], sigil: '/' };

    expect(TokenMappingSchema.parse(withSigil)).toStrictEqual(withSigil);
  });

  it('accepts a mapping declaring no sigil', () => {
    const withoutSigil = { kindId: 'tool', entries: [{ from: 'Read', to: 'view' }] };

    expect(TokenMappingSchema.parse(withoutSigil)).toStrictEqual(withoutSigil);
  });

  it('if entries is absent, rejects the mapping for that field', () => {
    expect(findIssuePaths(TokenMappingSchema, { kindId: 'tool', sigil: '/' })).toStrictEqual([['entries']]);
  });
});
