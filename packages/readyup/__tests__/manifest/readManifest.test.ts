import { describe, expect, it, vi } from 'vitest';

const mockReadFileSync = vi.hoisted(() => vi.fn());

vi.mock(import('node:fs'), () => ({
  readFileSync: mockReadFileSync,
}));

import { readManifest } from '../../src/manifest/readManifest.ts';

describe(readManifest, () => {
  it('returns a typed manifest for valid content', () => {
    const manifest = { version: 1, kits: [{ name: 'deploy', description: 'Deploy checks' }] };
    mockReadFileSync.mockReturnValue(JSON.stringify(manifest));

    const result = readManifest('/project/.readyup/manifest.json');

    expect(result).toStrictEqual(manifest);
  });

  it('returns a manifest without descriptions when they are absent', () => {
    const manifest = { version: 1, kits: [{ name: 'deploy' }] };
    mockReadFileSync.mockReturnValue(JSON.stringify(manifest));

    const result = readManifest('/project/.readyup/manifest.json');

    expect(result).toStrictEqual(manifest);
  });

  it('throws when the file does not exist', () => {
    mockReadFileSync.mockImplementation(() => {
      throw Object.assign(new Error("ENOENT: no such file or directory, open '/missing/manifest.json'"), {
        code: 'ENOENT',
      });
    });

    expect(() => readManifest('/missing/manifest.json')).toThrow('Manifest file not found');
  });

  it('throws with detail when the file is unreadable', () => {
    mockReadFileSync.mockImplementation(() => {
      throw Object.assign(new Error("EACCES: permission denied, open '/locked/manifest.json'"), {
        code: 'EACCES',
      });
    });

    expect(() => readManifest('/locked/manifest.json')).toThrow('Failed to read manifest file');
  });

  it('throws when the file contains invalid JSON', () => {
    mockReadFileSync.mockReturnValue('not json');

    expect(() => readManifest('/bad/manifest.json')).toThrow('invalid JSON');
  });

  it('throws when the manifest has an invalid schema', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: 2, kits: [] }));

    expect(() => readManifest('/bad/manifest.json')).toThrow('Invalid manifest schema');
  });
});
