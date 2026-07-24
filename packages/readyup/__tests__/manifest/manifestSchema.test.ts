import assert from 'node:assert';

import { describe, expect, it } from 'vitest';

import { ManifestSchema } from '../../src/manifest/manifestSchema.ts';

describe('ManifestSchema', () => {
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

  it('preserves both hashes on parse', () => {
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
    const [firstKit] = result.data.kits;
    assert.ok(firstKit);
    expect(firstKit.sourceHash).toBe('a1b2c3d4');
    expect(firstKit.targetHash).toBe('e5f6a7b8');
  });

  it('accepts an entry carrying a targetHash but no sourceHash', () => {
    const input = {
      version: 1,
      kits: [{ name: 'deploy', path: 'kits/deploy.js', source: 'kits/deploy.ts', targetHash: 'e5f6a7b8' }],
    };

    const result = ManifestSchema.safeParse(input);

    expect(result.success).toBe(true);
    assert.ok(result.success);
    expect(result.data.kits[0]?.sourceHash).toBeUndefined();
  });

  it('rejects a kit whose sourceHash is not a string', () => {
    const input = { version: 1, kits: [{ name: 'deploy', sourceHash: 42 }] };

    const result = ManifestSchema.safeParse(input);

    expect(result.success).toBe(false);
  });

  it('accepts a manifest with readyupVersion as an optional string and preserves it on parse', () => {
    const input = {
      version: 1,
      kits: [
        {
          name: 'deploy',
          path: 'kits/deploy.js',
          source: 'kits/deploy.ts',
          targetHash: 'a1b2c3d4',
          readyupVersion: '0.20.0',
        },
      ],
    };

    const result = ManifestSchema.safeParse(input);

    expect(result.success).toBe(true);
    assert.ok(result.success);
    expect(result.data.kits[0]?.readyupVersion).toBe('0.20.0');
  });

  it('accepts a manifest where readyupVersion is omitted', () => {
    const input = {
      version: 1,
      kits: [{ name: 'deploy' }],
    };

    const result = ManifestSchema.safeParse(input);

    expect(result.success).toBe(true);
    assert.ok(result.success);
    expect(result.data.kits[0]?.readyupVersion).toBeUndefined();
  });

  it('rejects a manifest where readyupVersion is a non-string value', () => {
    const input = {
      version: 1,
      kits: [{ name: 'deploy', readyupVersion: 42 }],
    };

    const result = ManifestSchema.safeParse(input);

    expect(result.success).toBe(false);
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
