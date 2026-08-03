import { describe, expect, it } from 'vitest';

import { TargetEntrySchema } from '../target-schemas.ts';
import { findIssuePaths } from '../test-utils/findIssuePaths.ts';

const target = { id: 'claude', label: 'Claude', root: '~/.claude', tokenMappings: [], variables: [] };

describe('TargetEntrySchema', () => {
  it('accepts a target declaring no token mappings and no variables', () => {
    expect(TargetEntrySchema.parse(target)).toStrictEqual(target);
  });

  it('if tokenMappings is absent, rejects the target for that field', () => {
    const withoutMappings = { id: 'claude', label: 'Claude', root: '~/.claude', variables: [] };

    expect(findIssuePaths(TargetEntrySchema, withoutMappings)).toStrictEqual([['tokenMappings']]);
  });

  // Objects stay open so a consumer pinned to this version accepts a payload carrying a field added later.
  it('accepts a target carrying an unrecognized key, and strips it', () => {
    expect(TargetEntrySchema.parse({ ...target, addedLater: 'ignored' })).toStrictEqual(target);
  });
});
