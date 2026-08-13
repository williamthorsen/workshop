import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const mockReadFileSync = vi.hoisted(() => vi.fn());

vi.mock(import('node:fs'), () => ({
  readFileSync: mockReadFileSync,
}));

import { hashBytes } from '../../verify/targetHash.ts';
import { createCompileRecorder } from '../createCompileRecorder.ts';

describe(createCompileRecorder, () => {
  it('starts with an empty closure', () => {
    expect(createCompileRecorder().inputs).toStrictEqual([]);
  });

  it('records a module read as its bytes and returns its contents', () => {
    const source = 'export const kit = 1;\n';
    mockReadFileSync.mockReturnValueOnce(Buffer.from(source));
    const recorder = createCompileRecorder();

    const contents = recorder.readModule('/project/src/kit.ts');

    expect(contents).toBe(source);
    expect(recorder.inputs).toStrictEqual([
      { hash: hashBytes(Buffer.from(source)), kind: 'module', path: '/project/src/kit.ts' },
    ]);
  });

  it('records a projection read with its path specifier and returns the serialized projection', () => {
    mockReadFileSync.mockReturnValueOnce(JSON.stringify({ name: 'my-pkg', version: '1.0.0' }));
    const recorder = createCompileRecorder();

    const projection = recorder.readProjection('/project/package.json', ['version']);

    expect(projection).toBe(JSON.stringify({ version: '1.0.0' }));
    expect(recorder.inputs).toStrictEqual([
      {
        hash: hashBytes(Buffer.from(projection, 'utf8')),
        kind: 'inline',
        path: '/project/package.json',
        paths: ['version'],
      },
    ]);
  });

  it('hashes a projection over what was picked, not over the file', () => {
    mockReadFileSync.mockReturnValueOnce(JSON.stringify({ name: 'my-pkg', scripts: { build: 'tsc' } }));
    const before = createCompileRecorder();
    before.readProjection('/project/package.json', ['name']);

    mockReadFileSync.mockReturnValueOnce(JSON.stringify({ name: 'my-pkg', scripts: { build: 'esbuild' } }));
    const after = createCompileRecorder();
    after.readProjection('/project/package.json', ['name']);

    expect(after.inputs).toStrictEqual(before.inputs);
  });

  it('resolves a relative path against the working directory', () => {
    mockReadFileSync.mockReturnValueOnce(Buffer.from('export const kit = 1;\n'));
    const recorder = createCompileRecorder();

    recorder.readModule('src/kit.ts');

    expect(recorder.inputs[0]?.path).toBe(path.resolve('src/kit.ts'));
  });

  it('collapses two reads of the same path and kind into one record', () => {
    const source = Buffer.from('export const kit = 1;\n');
    mockReadFileSync.mockReturnValue(source);
    const recorder = createCompileRecorder();

    recorder.readModule('/project/src/kit.ts');
    recorder.readModule('/project/src/kit.ts');

    expect(recorder.inputs).toHaveLength(1);
  });

  it('keeps the same path read as both kinds as two records', () => {
    mockReadFileSync
      .mockReturnValueOnce(Buffer.from(JSON.stringify({ name: 'my-pkg' })))
      .mockReturnValueOnce(JSON.stringify({ name: 'my-pkg' }));
    const recorder = createCompileRecorder();

    recorder.readModule('/project/data.json');
    recorder.readProjection('/project/data.json', ['name']);

    expect(recorder.inputs.map((input) => input.kind)).toStrictEqual(['module', 'inline']);
  });

  it('leaves the closure alone when a read fails', () => {
    mockReadFileSync.mockImplementationOnce(() => {
      throw new Error('ENOENT');
    });
    const recorder = createCompileRecorder();

    expect(() => recorder.readModule('/project/src/gone.ts')).toThrow('ENOENT');
    expect(recorder.inputs).toStrictEqual([]);
  });
});
