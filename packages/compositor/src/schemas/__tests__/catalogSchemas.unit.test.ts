import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { KindDescriptorSchema, SourceEntrySchema, SourceOriginSchema, TargetEntrySchema } from '../catalogSchemas.ts';
import { IdSchema } from '../common.ts';

const kind = { id: 'skill', label: 'Skill', emitsFiles: true };
const source = { id: 'team', name: 'team', origin: { kind: 'directory', location: '/srv/team' } };
const target = { id: 'claude', label: 'Claude', root: '~/.claude', tokenMappings: [], variables: [] };

const openCases: ReadonlyArray<readonly [string, z.ZodType, Record<string, unknown>]> = [
  ['KindDescriptorSchema', KindDescriptorSchema, kind],
  ['SourceEntrySchema', SourceEntrySchema, source],
  ['TargetEntrySchema', TargetEntrySchema, target],
];

describe('catalog schema evolution', () => {
  // Objects stay open so a consumer pinned to this version accepts a payload carrying a field added later.
  it.each(openCases)('%s accepts an entry carrying an unrecognized key, and strips it', (_label, schema, value) => {
    expect(schema.parse({ ...value, addedLater: 'ignored' })).toStrictEqual(value);
  });
});

describe('KindDescriptorSchema', () => {
  it('if emitsFiles is absent, rejects the kind for that field', () => {
    expect(findIssuePaths(KindDescriptorSchema, { id: 'collection', label: 'Collection' })).toStrictEqual([
      ['emitsFiles'],
    ]);
  });

  it('accepts a kind that produces no output', () => {
    const traversalOnly = { id: 'collection', label: 'Collection', emitsFiles: false };

    expect(KindDescriptorSchema.parse(traversalOnly)).toStrictEqual(traversalOnly);
  });
});

describe('SourceOriginSchema', () => {
  it('if the origin kind is outside the known set, rejects the origin for that field', () => {
    expect(findIssuePaths(SourceOriginSchema, { kind: 'registry', location: 'https://example.test' })).toStrictEqual([
      ['kind'],
    ]);
  });
});

describe('TargetEntrySchema', () => {
  it('accepts a target declaring no token mappings and no variables', () => {
    expect(TargetEntrySchema.parse(target)).toStrictEqual(target);
  });

  it('if tokenMappings is absent, rejects the target for that field', () => {
    const withoutMappings = { id: 'claude', label: 'Claude', root: '~/.claude', variables: [] };

    expect(findIssuePaths(TargetEntrySchema, withoutMappings)).toStrictEqual([['tokenMappings']]);
  });
});

describe('IdSchema', () => {
  it('if the id is empty, rejects it at the root', () => {
    expect(findIssuePaths(IdSchema, '')).toStrictEqual([[]]);
  });
});

/** The path of each validation issue `value` raises against `schema`, or `undefined` when it validates. */
function findIssuePaths(schema: z.ZodType, value: unknown): Array<ReadonlyArray<PropertyKey>> | undefined {
  const result = schema.safeParse(value);
  return result.success ? undefined : result.error.issues.map((issue) => issue.path);
}
