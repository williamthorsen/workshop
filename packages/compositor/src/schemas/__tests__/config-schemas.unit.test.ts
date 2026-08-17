import { describe, expect, it } from 'vitest';

import { CompositorConfigSchema, ConfigTierSchema, TierBodySchema } from '../config-schemas.ts';
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
  inlays: {
    'implementation-preferences': { rulebook: { use: ['naming'] } },
  },
};

const nothingDeclared = { shouldReset: false, sources: { use: [], drop: [] }, select: [], inlays: {} };

describe('TierBodySchema', () => {
  it('reads an empty body as a tier declaring nothing', () => {
    expect(TierBodySchema.parse({})).toStrictEqual(nothingDeclared);
  });

  it.each(['sources', 'select', 'inlays'] as const)('reads a null %s block as declaring nothing', (block) => {
    expect(TierBodySchema.parse({ [block]: null })).toStrictEqual(nothingDeclared);
  });

  it('reads a null binding as one naming the inlay and binding nothing to it', () => {
    expect(TierBodySchema.parse({ inlays: { preferences: null } })).toStrictEqual({
      ...nothingDeclared,
      inlays: { preferences: [] },
    });
  });

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
      shouldReset: false,
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
      inlays: {
        'implementation-preferences': [{ kindId: 'rulebook', use: [{ artifact: 'naming' }], drop: [] }],
      },
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

  it('parses its own output unchanged', () => {
    const config = CompositorConfigSchema.parse({ tiers: [authoredTier] });

    expect(CompositorConfigSchema.parse(config)).toStrictEqual(config);
  });

  it('rejects two tiers sharing an id', () => {
    const tiers = [authoredTier, { ...authoredTier, baseDir: '/srv/other' }];

    expect(findIssuePaths(CompositorConfigSchema, { tiers })).toStrictEqual([['tiers']]);
  });

  it('rejects an unrecognized top-level key, naming it', () => {
    const result = CompositorConfigSchema.safeParse({ tiers: [], targets: [] });

    expect(result.error?.issues).toMatchObject([{ code: 'unrecognized_keys', keys: ['targets'] }]);
  });
});
