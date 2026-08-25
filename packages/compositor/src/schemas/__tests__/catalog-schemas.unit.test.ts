import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import {
  CATALOG_SCHEMA_VERSION,
  CatalogEntrySchema,
  CatalogSchema,
  ResolveKindSchema,
  SourceSpecSchema,
} from '../catalog-schemas.ts';
import { KindDescriptorSchema, SourceEntrySchema } from '../descriptor-schemas.ts';
import { findIssuePaths } from '../test-utils/findIssuePaths.ts';

const fileKind = {
  id: 'rulebook',
  label: 'Rulebook',
  emitsFiles: true,
  layout: { form: 'directory' as const, root: 'x', entryFile: 'y' },
};
const directoryKind = {
  id: 'skill',
  label: 'Skill',
  emitsFiles: true,
  layout: { form: 'directory' as const, root: 'skills', entryFile: 'SKILL.md' },
};
const source = {
  id: 'team',
  name: 'team',
  origin: { kind: 'directory' as const, location: '../shared' },
  dir: '/srv/shared',
};
const entry = {
  id: 'skill:lint',
  kindId: 'skill',
  slug: 'lint',
  resolution: {
    winner: { sourceId: 'team', path: 'skills/lint/SKILL.md', hash: 'sha256:aa' },
    shadowed: [{ sourceId: 'library', path: 'skills/lint/SKILL.md', hash: 'sha256:bb' }],
  },
};

describe('CatalogSchema', () => {
  it('accepts a catalog containing every table', () => {
    const catalog = buildMinimalCatalog();

    expect(CatalogSchema.parse(catalog)).toStrictEqual(catalog);
  });

  it.each(['entries', 'kinds', 'sources', 'schemaVersion'] as const)(
    'if %s is absent, rejects the catalog for that field',
    (table) => {
      const { [table]: _dropped, ...incomplete } = buildMinimalCatalog();

      expect(findIssuePaths(CatalogSchema, incomplete)).toStrictEqual([[table]]);
    },
  );

  it('round-trips through JSON and revalidates identically', () => {
    const catalog = CatalogSchema.parse(buildMinimalCatalog());

    // eslint-disable-next-line unicorn/prefer-structured-clone -- passing through JSON is the property under test; a structured clone would not exercise it.
    expect(CatalogSchema.parse(JSON.parse(JSON.stringify(catalog)))).toStrictEqual(catalog);
  });

  it('declares a positive schema version', () => {
    expect(CATALOG_SCHEMA_VERSION).toBeGreaterThan(0);
  });
});

describe('ResolveKindSchema', () => {
  it('produces a kind a plan accepts in its own kinds table', () => {
    const resolveKind = ResolveKindSchema.parse(directoryKind);

    expect(KindDescriptorSchema.parse(resolveKind)).toStrictEqual({
      id: 'skill',
      label: 'Skill',
      emitsFiles: true,
    });
  });

  it('if the layout is absent, rejects the kind for that field', () => {
    const { layout: _dropped, ...withoutLayout } = directoryKind;

    expect(findIssuePaths(ResolveKindSchema, withoutLayout)).toStrictEqual([['layout']]);
  });
});

describe('SourceSpecSchema', () => {
  it('produces a source a plan accepts in its own sources table', () => {
    const spec = SourceSpecSchema.parse(source);

    expect(SourceEntrySchema.parse(spec)).toStrictEqual({
      id: 'team',
      name: 'team',
      origin: { kind: 'directory', location: '../shared' },
    });
  });

  it('if dir is absent, rejects the source for that field', () => {
    const { dir: _dropped, ...withoutDir } = source;

    expect(findIssuePaths(SourceSpecSchema, withoutDir)).toStrictEqual([['dir']]);
  });
});

describe('catalog schema evolution', () => {
  const openCases: ReadonlyArray<readonly [string, z.ZodType, Record<string, unknown>]> = [
    ['CatalogEntrySchema', CatalogEntrySchema, entry],
    ['ResolveKindSchema', ResolveKindSchema, fileKind],
    ['SourceSpecSchema', SourceSpecSchema, source],
  ];

  // Objects stay open so a consumer pinned to this version accepts a payload containing a field added later.
  it.each(openCases)('%s accepts an entry containing an unrecognized key, and strips it', (_label, schema, value) => {
    expect(schema.parse({ ...value, addedLater: 'ignored' })).toStrictEqual(value);
  });
});

// region | Helpers

/** Builds the smallest catalog that satisfies the schema: one kind, one source, one entry. */
function buildMinimalCatalog(): z.infer<typeof CatalogSchema> {
  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    kinds: [directoryKind],
    sources: [source],
    entries: [entry],
  };
}

// endregion | Helpers
