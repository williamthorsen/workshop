import * as esbuild from 'esbuild';
import { describe, expect, it, vi } from 'vitest';

const mockReadFileSync = vi.hoisted(() => vi.fn());

vi.mock(import('node:fs'), () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: mockReadFileSync,
  writeFileSync: vi.fn(),
}));

import { type CompileRecorder, createCompileRecorder } from '../createCompileRecorder.ts';
import { pickJsonPlugin } from '../pickJsonPlugin.ts';

type OnLoadCallback = Parameters<esbuild.PluginBuild['onLoad']>[1];

/** Returns a minimal `PluginBuild` stub, which implements `onLoad` alone. */
function stubBuild(onLoad: esbuild.PluginBuild['onLoad']): esbuild.PluginBuild {
  return {
    initialOptions: {},
    resolve: () => Promise.reject(new Error('resolve is not exercised in these tests')),
    onStart() {},
    onEnd() {},
    onResolve() {},
    onLoad,
    onDispose() {},
    esbuild,
  };
}

/** Returns the onLoad callback that the plugin registered, read back through a real recorder. */
function captureOnLoad(recorder: CompileRecorder = createCompileRecorder()): OnLoadCallback {
  let captured: OnLoadCallback | undefined;
  const plugin = pickJsonPlugin(recorder);
  void plugin.setup(
    stubBuild((_options, callback) => {
      captured = callback;
    }),
  );
  if (captured === undefined) {
    throw new Error('onLoad callback was not registered');
  }
  return captured;
}

/** Returns the synchronous result of invoking the captured onLoad for a source path. */
function runOnLoad(onLoad: OnLoadCallback, path: string): esbuild.OnLoadResult | null | undefined {
  const result = onLoad({ path, namespace: 'file', suffix: '', pluginData: undefined, with: {} });
  if (result instanceof Promise) {
    throw new TypeError('pickJson onLoad is synchronous');
  }
  return result;
}

describe(pickJsonPlugin, () => {
  it('returns a plugin with the name "pick-json"', () => {
    const plugin = pickJsonPlugin(createCompileRecorder());

    expect(plugin.name).toBe('pick-json');
  });

  it('returns null for files that do not contain pickJson', () => {
    const onLoad = captureOnLoad();
    mockReadFileSync.mockReturnValue('const x = 1;');

    const result = runOnLoad(onLoad, '/project/src/kit.ts');

    expect(result).toBeNull();
  });

  it('replaces a pickJson call with an inlined object literal', () => {
    const onLoad = captureOnLoad();
    const sourceCode = `const meta = pickJson('./package.json', ['name', 'version']);`;
    const jsonContent = JSON.stringify({ name: 'my-pkg', version: '1.0.0', license: 'MIT' });

    mockReadFileSync.mockReturnValueOnce(sourceCode).mockReturnValueOnce(jsonContent);

    const result = runOnLoad(onLoad, '/project/src/kit.ts');

    expect(result).not.toBeNull();
    expect(result?.contents).toBe(`const meta = ${JSON.stringify({ name: 'my-pkg', version: '1.0.0' })};`);
    expect(result?.loader).toBe('ts');
  });

  it('throws when the source file cannot be read', () => {
    const onLoad = captureOnLoad();

    mockReadFileSync.mockImplementationOnce(() => {
      throw new Error('EACCES');
    });

    expect(() => runOnLoad(onLoad, '/project/src/kit.ts')).toThrow('Cannot read source file');
  });

  it('records the module that it loaded and the JSON file that it projected', () => {
    const recorder = createCompileRecorder();
    const onLoad = captureOnLoad(recorder);
    const sourceCode = `const meta = pickJson('./package.json', ['name']);`;
    mockReadFileSync.mockReturnValueOnce(sourceCode).mockReturnValueOnce(JSON.stringify({ name: 'my-pkg', x: 1 }));

    runOnLoad(onLoad, '/project/src/kit.ts');

    expect(recorder.inputs).toStrictEqual([
      { hash: expect.any(String), kind: 'module', path: '/project/src/kit.ts' },
      { hash: expect.any(String), kind: 'inline', path: '/project/src/package.json', paths: ['name'] },
    ]);
  });

  it('registers onLoad filter for TypeScript extensions only', () => {
    let capturedFilter: RegExp | undefined;
    const plugin = pickJsonPlugin(createCompileRecorder());
    void plugin.setup(
      stubBuild((options, _callback) => {
        capturedFilter = options.filter;
      }),
    );

    expect(capturedFilter).toBeDefined();
    // TypeScript extensions match.
    expect(capturedFilter?.test('file.ts')).toBe(true);
    expect(capturedFilter?.test('file.mts')).toBe(true);
    expect(capturedFilter?.test('file.cts')).toBe(true);
    // Non-TypeScript extensions do not match.
    expect(capturedFilter?.test('file.js')).toBe(false);
    expect(capturedFilter?.test('file.jsx')).toBe(false);
    expect(capturedFilter?.test('file.tsx')).toBe(false);
  });
});
