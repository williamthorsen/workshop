import assert from 'node:assert';

import { describe, expect, it } from 'vitest';

import { ManifestSchema } from '../manifestSchema.ts';

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

  it('accepts an entry with a targetHash but no sourceHash', () => {
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

  it('round-trips an entry with recorded inputs', () => {
    const inputs = [
      { hash: 'a1b2c3d4', kind: 'inline', path: '../package.json', paths: ['version', ['engines', 'node']] },
      { hash: 'e5f6a7b8', kind: 'module', path: 'kits/checks/shared.ts' },
    ];
    const input = { version: 1, kits: [{ inputs, name: 'deploy' }] };

    const result = ManifestSchema.safeParse(input);

    expect(result.success).toBe(true);
    assert.ok(result.success);
    expect(result.data.kits[0]?.inputs).toStrictEqual(inputs);
  });

  it('accepts an entry that records no inputs', () => {
    const input = { version: 1, kits: [{ name: 'deploy', sourceHash: 'a1b2c3d4', targetHash: 'e5f6a7b8' }] };

    const result = ManifestSchema.safeParse(input);

    expect(result.success).toBe(true);
    assert.ok(result.success);
    expect(result.data.kits[0]?.inputs).toBeUndefined();
  });

  it('rejects an inline input that records no paths', () => {
    const input = {
      version: 1,
      kits: [{ inputs: [{ hash: 'a1b2c3d4', kind: 'inline', path: 'pkg.json' }], name: 'deploy' }],
    };

    const result = ManifestSchema.safeParse(input);

    expect(result.success).toBe(false);
  });

  it('rejects a module input that records paths', () => {
    const inputs = [{ hash: 'a1b2c3d4', kind: 'module', path: 'kits/shared.ts', paths: ['version'] }];
    const input = { version: 1, kits: [{ inputs, name: 'deploy' }] };

    const result = ManifestSchema.safeParse(input);

    expect(result.success).toBe(false);
  });

  it('rejects an input of an unrecognized kind', () => {
    const inputs = [{ hash: 'a1b2c3d4', kind: 'asset', path: 'logo.png' }];
    const input = { version: 1, kits: [{ inputs, name: 'deploy' }] };

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

  it.each(['sourceHash', 'targetHash'])('accepts a full 64-character digest as %s', (field) => {
    const input = { version: 1, kits: [{ name: 'deploy', [field]: FULL_DIGEST }] };

    const result = ManifestSchema.safeParse(input);

    expect(result.success).toBe(true);
  });

  it.each(['sourceHash', 'targetHash'])('accepts a twelve-character prefix as %s', (field) => {
    const input = { version: 1, kits: [{ name: 'deploy', [field]: FULL_DIGEST.slice(0, 12) }] };

    const result = ManifestSchema.safeParse(input);

    expect(result.success).toBe(true);
  });

  it.each(MALFORMED_HASHES)('rejects %o as a sourceHash, which is %s', (hash) => {
    const input = { version: 1, kits: [{ name: 'deploy', sourceHash: hash }] };

    const result = ManifestSchema.safeParse(input);

    expect(result.success).toBe(false);
  });

  it.each(MALFORMED_HASHES)('rejects %o as a targetHash, which is %s', (hash) => {
    const input = { version: 1, kits: [{ name: 'deploy', targetHash: hash }] };

    const result = ManifestSchema.safeParse(input);

    expect(result.success).toBe(false);
  });

  it.each(MALFORMED_HASHES)("rejects %o as an input's hash, which is %s", (hash) => {
    const inputs = [{ hash, kind: 'module', path: 'kits/shared.ts' }];
    const input = { version: 1, kits: [{ name: 'deploy', inputs }] };

    const result = ManifestSchema.safeParse(input);

    expect(result.success).toBe(false);
  });

  it('names the recorded-hash form in the failure message', () => {
    const input = { version: 1, kits: [{ name: 'deploy', targetHash: 'abc' }] };

    const result = ManifestSchema.safeParse(input);

    assert.ok(!result.success);
    expect(result.error.message).toContain('lowercase hex digest prefix of 8 to 64 characters');
  });
});

// region | Helpers

const FULL_DIGEST = 'a1b2c3d4e5f6a7b8'.repeat(4);

const MALFORMED_HASHES: [string, string][] = [
  ['', 'empty'],
  ['a1b2c3d', 'one character below the floor'],
  ['a'.repeat(65), 'one character above a full digest'],
  ['A1B2C3D4', 'uppercase'],
  ['a1b2c3g4', 'a non-hex character'],
];

// endregion | Helpers
