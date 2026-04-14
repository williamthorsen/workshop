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
