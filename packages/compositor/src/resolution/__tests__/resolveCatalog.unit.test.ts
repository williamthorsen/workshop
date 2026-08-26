import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { CatalogEntry, ResolveKind, SourceSpec } from '../../schemas/catalog-schemas.ts';
import { CATALOG_SCHEMA_VERSION, CatalogSchema } from '../../schemas/catalog-schemas.ts';
import { assertCatalogIsConsistent } from '../assertCatalogIsConsistent.ts';
import { resolveCatalog } from '../resolveCatalog.ts';
import { buildSource } from '../test-utils/buildSource.ts';

const kinds: ReadonlyArray<ResolveKind> = [
  {
    id: 'rulebook',
    label: 'Rulebook',
    emitsFiles: true,
    layout: { form: 'file', root: 'guidance/rulebooks', extension: '.md' },
  },
  {
    id: 'skill',
    label: 'Skill',
    emitsFiles: true,
    layout: { form: 'directory', root: 'skills', entryFile: 'SKILL.md' },
  },
];

describe(resolveCatalog, () => {
  it('gives the highest-precedence source the win and lists the rest as shadowed, in precedence order', async () => {
    const sources = buildSources({
      local: { 'skills/review/SKILL.md': 'local' },
      team: { 'skills/review/SKILL.md': 'team' },
      library: { 'skills/review/SKILL.md': 'library' },
    });

    const { resolution } = await requireOnlyEntry(sources);

    expect(resolution.winner.sourceId).toBe('local');
    expect(resolution.shadowed.map((candidate) => candidate.sourceId)).toStrictEqual(['team', 'library']);
  });

  it('gives the lowest-precedence source the win when it alone contains the artifact', async () => {
    const sources = buildSources({
      local: {},
      team: {},
      library: { 'skills/lint/SKILL.md': 'library' },
    });

    const { resolution } = await requireOnlyEntry(sources);

    expect(resolution.winner.sourceId).toBe('library');
    expect(resolution.shadowed).toStrictEqual([]);
  });

  it('leaves shadowed empty for an artifact only one source contains', async () => {
    const sources = buildSources({
      local: { 'skills/only/SKILL.md': 'local' },
      library: {},
    });

    await expect(requireOnlyEntry(sources)).resolves.toMatchObject({ resolution: { shadowed: [] } });
  });

  it('records each candidate at the path and digest of the source containing it', async () => {
    const sources = buildSources({
      local: { 'guidance/rulebooks/style.md': 'local text' },
      library: { 'guidance/rulebooks/style.md': 'library text' },
    });

    const { resolution } = await requireOnlyEntry(sources);

    expect(resolution.winner.path).toBe('guidance/rulebooks/style.md');
    expect(resolution.winner.hash).not.toBe(resolution.shadowed.at(0)?.hash);
  });

  it('reports an identical copy in a lower source with the same digest as the winner', async () => {
    const sources = buildSources({
      local: { 'guidance/rulebooks/style.md': 'same bytes' },
      library: { 'guidance/rulebooks/style.md': 'same bytes' },
    });

    const { resolution } = await requireOnlyEntry(sources);

    expect(resolution.shadowed.at(0)?.hash).toBe(resolution.winner.hash);
  });

  it('unions what the sources contain rather than taking only the winner source contents', async () => {
    const sources = buildSources({
      local: { 'skills/review/SKILL.md': 'local' },
      library: { 'skills/lint/SKILL.md': 'library', 'guidance/rulebooks/style.md': 'library' },
    });

    const catalog = await resolveCatalog({ kinds, sources });

    expect(catalog.entries.map((entry) => entry.id)).toStrictEqual(['rulebook:style', 'skill:lint', 'skill:review']);
  });

  it('composes each entry id from its kind and slug', async () => {
    const sources = buildSources({ local: { 'skills/lint/SKILL.md': 'local' } });

    await expect(requireOnlyEntry(sources)).resolves.toMatchObject({ id: 'skill:lint', kindId: 'skill', slug: 'lint' });
  });

  it('orders entries lexicographically by id', async () => {
    const sources = buildSources({
      local: {
        'skills/review/SKILL.md': 'local',
        'skills/lint/SKILL.md': 'local',
        'guidance/rulebooks/style.md': 'local',
        'guidance/rulebooks/naming.md': 'local',
      },
    });

    const ids = (await resolveCatalog({ kinds, sources })).entries.map((entry) => entry.id);

    expect(ids).toStrictEqual([...ids].toSorted());
  });

  it('echoes the kinds and sources it was given, so a reader needs nothing beside the catalog', async () => {
    const sources = buildSources({ local: { 'skills/lint/SKILL.md': 'local' }, library: {} });

    const catalog = await resolveCatalog({ kinds, sources });

    expect(catalog.kinds).toStrictEqual(kinds);
    expect(catalog.sources).toStrictEqual(sources);
    expect(catalog.schemaVersion).toBe(CATALOG_SCHEMA_VERSION);
  });

  it('yields the same catalog across runs over unchanged sources', async () => {
    const sources = buildSources({
      local: { 'skills/review/SKILL.md': 'local', 'guidance/rulebooks/style.md': 'local' },
      library: { 'skills/review/SKILL.md': 'library', 'skills/lint/SKILL.md': 'library' },
    });

    const [first, second] = await Promise.all([resolveCatalog({ kinds, sources }), resolveCatalog({ kinds, sources })]);

    expect(second).toStrictEqual(first);
  });

  it('produces a catalog that satisfies the schema and every consistency invariant', async () => {
    const sources = buildSources({
      local: { 'skills/review/SKILL.md': 'local' },
      team: { 'skills/review/SKILL.md': 'team', 'guidance/rulebooks/style.md': 'team' },
      library: { 'skills/review/SKILL.md': 'library', 'skills/lint/SKILL.md': 'library' },
    });

    const catalog = await resolveCatalog({ kinds, sources });

    expect(CatalogSchema.parse(catalog)).toStrictEqual(catalog);
    expect(() => {
      assertCatalogIsConsistent(catalog);
    }).not.toThrow();
  });

  it('contains no entry when the sources are empty', async () => {
    const sources = buildSources({ local: {}, library: {} });

    await expect(resolveCatalog({ kinds, sources })).resolves.toMatchObject({ entries: [] });
  });

  it('fails the whole call when any source is missing, rather than resolving around it', async () => {
    const sources = buildSources({ local: { 'skills/lint/SKILL.md': 'local' }, library: {} });
    const absent: SourceSpec = {
      id: 'absent',
      name: 'absent',
      origin: { kind: 'directory', location: './absent' },
      dir: path.join(tmpdir(), 'compositor-absent-source'),
    };

    await expect(resolveCatalog({ kinds, sources: [...sources, absent] })).rejects.toThrow(/does not exist/);
  });
});

// region | Helpers

/** Builds one source directory per named entry, in the order given, highest precedence first. */
function buildSources(byName: Record<string, Record<string, string>>): ReadonlyArray<SourceSpec> {
  return Object.entries(byName).map(([name, files]) => buildSource(files, name));
}

/** Reads the catalog's single entry, failing the test when it contains any other number. */
async function requireOnlyEntry(sources: ReadonlyArray<SourceSpec>): Promise<CatalogEntry> {
  const { entries } = await resolveCatalog({ kinds, sources });
  const entry = entries.at(0);
  if (entries.length !== 1 || entry === undefined) {
    throw new Error(`Expected exactly one entry, and the catalog contains ${entries.length}.`);
  }
  return entry;
}

// endregion | Helpers
