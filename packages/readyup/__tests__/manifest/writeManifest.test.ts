import { describe, expect, it, vi } from 'vitest';

const mockMkdirSync = vi.hoisted(() => vi.fn());
const mockWriteFileSync = vi.hoisted(() => vi.fn());

vi.mock(import('node:fs'), () => ({
  mkdirSync: mockMkdirSync,
  writeFileSync: mockWriteFileSync,
}));

import type { RdyManifest } from '../../src/manifest/manifestSchema.ts';
import { writeManifest } from '../../src/manifest/writeManifest.ts';

describe(writeManifest, () => {
  it('writes formatted JSON with a trailing newline', () => {
    const manifest: RdyManifest = { version: 1, kits: [{ name: 'deploy' }] };

    writeManifest('/project/.readyup/manifest.json', manifest);

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      '/project/.readyup/manifest.json',
      JSON.stringify(manifest, null, 2) + '\n',
      'utf8',
    );
  });

  it('creates parent directories before writing', () => {
    const manifest: RdyManifest = { version: 1, kits: [] };

    writeManifest('/project/.readyup/manifest.json', manifest);

    expect(mockMkdirSync).toHaveBeenCalledWith('/project/.readyup', { recursive: true });
  });
});
