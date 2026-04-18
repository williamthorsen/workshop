import assert from 'node:assert';

import { describe, expect, it } from 'vitest';

import { ManifestSchema } from '../../src/manifest/manifestSchema.ts';

describe(ManifestSchema, () => {
  it('accepts a valid manifest with descriptions', () => {
    const input = {
      version: 1,
      kits: [{ name: 'default', description: 'General health checks' }, { name: 'deploy' }],
    };

    const result = ManifestSchema.safeParse(input);

    expect(result.success).toBe(true);
  });

  it('accepts a manifest with an empty kits array', () => {
    const input = { version: 1, kits: [] };

    const result = ManifestSchema.safeParse(input);

    expect(result.success).toBe(true);
  });

  it('rejects a manifest with wrong version', () => {
    const input = { version: 2, kits: [] };

    const result = ManifestSchema.safeParse(input);

    expect(result.success).toBe(false);
  });

  it('rejects a manifest missing version', () => {
    const input = { kits: [] };

    const result = ManifestSchema.safeParse(input);

    expect(result.success).toBe(false);
  });

  it('rejects a manifest missing kits', () => {
    const input = { version: 1 };

    const result = ManifestSchema.safeParse(input);

    expect(result.success).toBe(false);
  });

  it('accepts a manifest with path, source, and targetHash fields', () => {
    const input = {
      version: 1,
      kits: [
        {
          name: 'deploy',
          description: 'Deploy checks',
          path: 'kits/deploy.js',
          source: 'kits/deploy.ts',
          targetHash: 'a1b2c3d4',
        },
      ],
    };

    const result = ManifestSchema.safeParse(input);

    expect(result.success).toBe(true);
  });

  it('accepts a manifest mixing entries with and without location fields', () => {
    const input = {
      version: 1,
      kits: [
        { name: 'default', description: 'General health checks' },
        { name: 'deploy', path: 'kits/deploy.js', source: 'kits/deploy.ts', targetHash: 'abcd1234' },
      ],
    };

    const result = ManifestSchema.safeParse(input);

    expect(result.success).toBe(true);
  });

  it('strips legacy sourceHash field from kit entries on parse while preserving targetHash', () => {
    const input = {
      version: 1,
      kits: [
        {
          name: 'deploy',
          path: 'kits/deploy.js',
          source: 'kits/deploy.ts',
          sourceHash: 'a1b2c3d4',
          targetHash: 'e5f6a7b8',
        },
      ],
    };

    const result = ManifestSchema.safeParse(input);

    expect(result.success).toBe(true);
    assert.ok(result.success);
    expect(result.data.kits[0]).not.toHaveProperty('sourceHash');
    expect(result.data.kits[0].targetHash).toBe('e5f6a7b8');
  });

  it('rejects a kit with an empty name', () => {
    const input = { version: 1, kits: [{ name: '' }] };

    const result = ManifestSchema.safeParse(input);

    expect(result.success).toBe(false);
  });

  it('rejects a kit missing the name field', () => {
    const input = { version: 1, kits: [{ description: 'orphan' }] };

    const result = ManifestSchema.safeParse(input);

    expect(result.success).toBe(false);
  });
});
