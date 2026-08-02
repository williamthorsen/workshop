import { describe, expect, it } from 'vitest';

import {
  CompositorConfigSchema,
  ConfigTierSchema,
  DeclaredSourceSchema,
  KindSelectionSchema,
  SelectorSchema,
  SelectSchema,
  SourceDeclarationSchema,
  TierBodySchema,
} from '../config-schemas.ts';
import { findIssuePaths } from '../test-utils/findIssuePaths.ts';

const authoredTier = {
  id: 'project',
  label: 'Project',
  baseDir: '/srv/app/.agents',
  sources: {
    use: [
      { name: 'local', path: './content' },
      { name: 'acme', package: '@acme/guidance' },
    ],
    drop: ['vendor'],
  },
  select: {
    skill: { use: ['lint', { source: 'acme' }], drop: ['legacy'] },
    rulebook: { use: [{ source: 'local' }] },
  },
};

describe('SelectorSchema', () => {
  it('reads a bare string as the artifact it names', () => {
    expect(SelectorSchema.parse('lint')).toStrictEqual({ artifact: 'lint' });
  });

  it.each([
    ['an artifact', { artifact: 'lint' }],
    ['a source', { source: 'acme' }],
  ])('accepts the object form naming %s', (_label, selector) => {
    expect(SelectorSchema.parse(selector)).toStrictEqual(selector);
  });

  // Rejecting rather than stripping is the point: a strip would discard half of what the author wrote.
  it('rejects an entry naming both an artifact and a source', () => {
    expect(findIssuePaths(SelectorSchema, { artifact: 'lint', source: 'acme' })).toBeDefined();
  });

  it('rejects an entry naming neither', () => {
    expect(findIssuePaths(SelectorSchema, {})).toBeDefined();
  });
});

describe('DeclaredSourceSchema', () => {
  it.each([
    ['path', { name: 'local', path: './content' }, { kind: 'directory', location: './content' }],
    ['package', { name: 'acme', package: '@acme/guidance' }, { kind: 'package', location: '@acme/guidance' }],
  ])('normalizes an authored %s into a source origin', (_label, declared, origin) => {
    expect(DeclaredSourceSchema.parse(declared)).toStrictEqual({ name: declared.name, origin });
  });

  it('keeps the location as authored, so a plan reports what a consumer wrote', () => {
    expect(DeclaredSourceSchema.parse({ name: 'home', path: '~/guidance' })).toStrictEqual({
      name: 'home',
      origin: { kind: 'directory', location: '~/guidance' },
    });
  });

  it('rejects a source declaring both a path and a package', () => {
    const declared = { name: 'local', path: './content', package: '@acme/guidance' };

    expect(findIssuePaths(DeclaredSourceSchema, declared)).toBeDefined();
  });
});

describe('SourceDeclarationSchema', () => {
  it('defaults both lists to empty', () => {
    expect(SourceDeclarationSchema.parse({})).toStrictEqual({ use: [], drop: [] });
  });

  it('drops sources by name', () => {
    expect(SourceDeclarationSchema.parse({ drop: ['vendor'] })).toStrictEqual({ use: [], drop: ['vendor'] });
  });
});

describe('SelectSchema', () => {
  it('normalizes a kind-keyed mapping into entries sorted by kind', () => {
    const select = SelectSchema.parse({ skill: { use: ['lint'] }, rulebook: { use: ['house-style'] } });

    expect(select).toStrictEqual([
      { kindId: 'rulebook', use: [{ artifact: 'house-style' }], drop: [] },
      { kindId: 'skill', use: [{ artifact: 'lint' }], drop: [] },
    ]);
  });

  // A kind key with nothing under it is what an author leaves behind after commenting every entry out.
  it('reads a kind whose block is null as declaring nothing', () => {
    expect(SelectSchema.parse({ skill: null })).toStrictEqual([{ kindId: 'skill', use: [], drop: [] }]);
  });

  it('rejects an array naming one kind twice', () => {
    const select = [
      { kindId: 'skill', use: ['lint'] },
      { kindId: 'skill', use: ['format'] },
    ];

    expect(findIssuePaths(SelectSchema, select)).toBeDefined();
  });
});

describe('KindSelectionSchema', () => {
  it('defaults both lists to empty', () => {
    expect(KindSelectionSchema.parse({ kindId: 'skill' })).toStrictEqual({ kindId: 'skill', use: [], drop: [] });
  });
});

describe('TierBodySchema', () => {
  it('reads an empty body as a tier declaring nothing', () => {
    expect(TierBodySchema.parse({})).toStrictEqual({ reset: false, sources: { use: [], drop: [] }, select: [] });
  });

  it.each(['sources', 'select'] as const)('reads a null %s block as declaring nothing', (block) => {
    expect(TierBodySchema.parse({ [block]: null })).toStrictEqual({
      reset: false,
      sources: { use: [], drop: [] },
      select: [],
    });
  });

  // Strict, so a misspelled key fails rather than declaring nothing at all.
  it('rejects an unrecognized top-level key, naming it', () => {
    const result = TierBodySchema.safeParse({ selects: {} });

    expect(result.error?.issues).toMatchObject([{ code: 'unrecognized_keys', keys: ['selects'] }]);
  });
});

describe('ConfigTierSchema', () => {
  it('normalizes an authored tier', () => {
    expect(ConfigTierSchema.parse(authoredTier)).toStrictEqual({
      id: 'project',
      label: 'Project',
      baseDir: '/srv/app/.agents',
      reset: false,
      sources: {
        use: [
          { name: 'local', origin: { kind: 'directory', location: './content' } },
          { name: 'acme', origin: { kind: 'package', location: '@acme/guidance' } },
        ],
        drop: ['vendor'],
      },
      select: [
        { kindId: 'rulebook', use: [{ source: 'local' }], drop: [] },
        { kindId: 'skill', use: [{ artifact: 'lint' }, { source: 'acme' }], drop: [{ artifact: 'legacy' }] },
      ],
    });
  });

  it.each(['id', 'label', 'baseDir'] as const)('if %s is absent, rejects the tier for that field', (field) => {
    const { [field]: _dropped, ...incomplete } = authoredTier;

    expect(findIssuePaths(ConfigTierSchema, incomplete)).toStrictEqual([[field]]);
  });
});

describe('CompositorConfigSchema', () => {
  it('reads a config with no tiers as declaring nothing', () => {
    expect(CompositorConfigSchema.parse({})).toStrictEqual({ tiers: [] });
  });

  // A What-if pass mutates a config it already holds and re-parses it, so normalizing twice must change nothing.
  it('parses its own output unchanged', () => {
    const config = CompositorConfigSchema.parse({ tiers: [authoredTier] });

    expect(CompositorConfigSchema.parse(config)).toStrictEqual(config);
  });

  it('rejects an unrecognized top-level key, naming it', () => {
    const result = CompositorConfigSchema.safeParse({ tiers: [], targets: [] });

    expect(result.error?.issues).toMatchObject([{ code: 'unrecognized_keys', keys: ['targets'] }]);
  });
});
