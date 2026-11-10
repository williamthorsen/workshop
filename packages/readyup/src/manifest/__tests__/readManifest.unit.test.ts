import { captureError } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it, vi } from 'vitest';

const mockReadFileSync = vi.hoisted(() => vi.fn());

vi.mock(import('node:fs'), () => ({
  readFileSync: mockReadFileSync,
}));

import { RdyError } from '../../errors/RdyError.ts';
import { ManifestNotFoundError, readManifest } from '../readManifest.ts';

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

  it('throws a config ManifestNotFoundError when the file does not exist', async () => {
    mockReadFileSync.mockImplementation(() => {
      throw Object.assign(new Error("ENOENT: no such file or directory, open '/missing/manifest.json'"), {
        code: 'ENOENT',
      });
    });

    const error = await captureError(() => readManifest('/missing/manifest.json'));

    expect(error).toBeInstanceOf(ManifestNotFoundError);
    expect(error).toMatchObject({ code: 'config', message: 'Manifest file not found: /missing/manifest.json' });
  });

  it('throws with detail when the file is unreadable, preserving the read failure as the cause', async () => {
    const readFailure = Object.assign(new Error("EACCES: permission denied, open '/locked/manifest.json'"), {
      code: 'EACCES',
    });
    mockReadFileSync.mockImplementation(() => {
      throw readFailure;
    });

    const error = await captureError(() => readManifest('/locked/manifest.json'));

    expect(error).toBeInstanceOf(RdyError);
    expect(error).toMatchObject({ code: 'config' });
    expect(error.message).toBe(`Failed to read manifest file /locked/manifest.json: ${readFailure.message}`);
    expect(error.cause).toBe(readFailure);
  });

  it('throws a config error with the parse failure as the cause when the file contains invalid JSON', async () => {
    mockReadFileSync.mockReturnValue('not json');

    const error = await captureError(() => readManifest('/bad/manifest.json'));

    expect(error).toBeInstanceOf(RdyError);
    expect(error).toMatchObject({ code: 'config' });
    expect(error.message).toMatch(/^Manifest file contains invalid JSON: \/bad\/manifest\.json: \S/);
    expect(error.cause).toBeInstanceOf(SyntaxError);
  });

  it('throws a config error with the validation failure as the cause when the schema is invalid', async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: 2, kits: [] }));

    const error = await captureError(() => readManifest('/bad/manifest.json'));

    expect(error).toBeInstanceOf(RdyError);
    expect(error).toMatchObject({ code: 'config' });
    expect(error.message).toMatch(/^Invalid manifest schema in \/bad\/manifest\.json: /);
    expect(error.cause).toBeInstanceOf(Error);
  });
});
