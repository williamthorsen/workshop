import { describe, expect, it, vi } from 'vitest';

const mockReadFileSync = vi.hoisted(() => vi.fn());

vi.mock(import('node:fs'), () => ({
  readFileSync: mockReadFileSync,
}));

import { captureError } from '../../test-utils/captureError.ts';
import { readManifest } from '../readManifest.ts';

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

  it('throws with detail when the file is unreadable, preserving the read failure as the cause', async () => {
    const readFailure = Object.assign(new Error("EACCES: permission denied, open '/locked/manifest.json'"), {
      code: 'EACCES',
    });
    mockReadFileSync.mockImplementation(() => {
      throw readFailure;
    });

    const error = await captureError(() => readManifest('/locked/manifest.json'));

    expect(error.message).toContain('Failed to read manifest file');
    expect(error.cause).toBe(readFailure);
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
