import { captureError } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it, vi } from 'vitest';

const mockReadFileSync = vi.hoisted(() => vi.fn());

vi.mock(import('node:fs'), () => ({
  readFileSync: mockReadFileSync,
}));

import { JsonProjectionError } from '../JsonProjectionError.ts';
import { projectJsonFile } from '../projectJsonFile.ts';

/** Runs the projection over a file with the given contents and returns the `JsonProjectionError` it raised. */
async function captureProjectionError(
  fileContents: string | Error,
  paths: string[] = ['name'],
): Promise<JsonProjectionError> {
  if (fileContents instanceof Error) {
    mockReadFileSync.mockImplementationOnce(() => {
      throw fileContents;
    });
  } else {
    mockReadFileSync.mockReturnValueOnce(fileContents);
  }

  return captureError(JsonProjectionError, () => projectJsonFile('/project/data.json', paths));
}

describe(projectJsonFile, () => {
  it('returns the projection serialized', () => {
    mockReadFileSync.mockReturnValueOnce(JSON.stringify({ license: 'ISC', name: 'my-pkg', version: '1.0.0' }));

    const projection = projectJsonFile('/project/package.json', ['name', 'version']);

    expect(projection).toBe(JSON.stringify({ name: 'my-pkg', version: '1.0.0' }));
  });

  it('preserves the nesting of a nested path', () => {
    mockReadFileSync.mockReturnValueOnce(JSON.stringify({ engines: { node: '>=24', pnpm: '10' } }));

    const projection = projectJsonFile('/project/package.json', [['engines', 'node']]);

    expect(projection).toBe(JSON.stringify({ engines: { node: '>=24' } }));
  });

  it('yields the same projection when an unpicked field changes', () => {
    mockReadFileSync.mockReturnValueOnce(JSON.stringify({ name: 'my-pkg', scripts: { build: 'tsc' } }));
    const before = projectJsonFile('/project/package.json', ['name']);

    mockReadFileSync.mockReturnValueOnce(JSON.stringify({ name: 'my-pkg', scripts: { build: 'esbuild' } }));
    const after = projectJsonFile('/project/package.json', ['name']);

    expect(after).toBe(before);
  });

  it('reports an unreadable file as unreadable, naming it', async () => {
    const error = await captureProjectionError(new Error('ENOENT'));

    expect(error.reason).toBe('unreadable');
    expect(error.filePath).toBe('/project/data.json');
    expect(error.message).toContain('/project/data.json');
  });

  it('reports malformed JSON as invalid-json', async () => {
    const error = await captureProjectionError('{broken');

    expect(error.reason).toBe('invalid-json');
  });

  // The detail names the root as JSON sees it, so an array and a null are distinguishable from an object.
  it('reports a non-object root as not-an-object, carrying the type it found', async () => {
    const error = await captureProjectionError('[1,2,3]');

    expect(error.reason).toBe('not-an-object');
    expect(error.detail).toBe('array');
  });

  it('names a null root as null rather than as an object', async () => {
    const error = await captureProjectionError('null');

    expect(error.reason).toBe('not-an-object');
    expect(error.detail).toBe('null');
  });

  it('reports a picked path the file does not have as path-not-found, naming the path', async () => {
    const error = await captureProjectionError(JSON.stringify({ name: 'my-pkg' }), ['version']);

    expect(error.reason).toBe('path-not-found');
    expect(error.detail).toBe('version');
    expect(error.message).toBe('Path not found in JSON: version');
  });
});
