import { describe, expect, it, vi } from 'vitest';

const mockReadFileSync = vi.hoisted(() => vi.fn());

vi.mock(import('node:fs'), () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: mockReadFileSync,
  writeFileSync: vi.fn(),
}));

import { pickJsonPlugin } from '../../src/compile/pickJsonPlugin.ts';

interface LoadCallback {
  (args: { path: string }): { contents: string; loader: string } | null | undefined;
}

/** Capture the onLoad callback registered by the plugin. */
function captureOnLoad(): LoadCallback {
  let captured: LoadCallback | undefined;
  const plugin = pickJsonPlugin();
  void plugin.setup({
    onLoad(_options: { filter: RegExp }, callback: LoadCallback) {
      captured = callback;
    },
  });
  if (captured === undefined) {
    throw new Error('onLoad callback was not registered');
  }
  return captured;
}

describe(pickJsonPlugin, () => {
  it('returns a plugin with the name "pick-json"', () => {
    const plugin = pickJsonPlugin();

    expect(plugin.name).toBe('pick-json');
  });

  it('returns null for files that do not contain pickJson', () => {
    const onLoad = captureOnLoad();
    mockReadFileSync.mockReturnValue('const x = 1;');

    const result = onLoad({ path: '/project/src/kit.ts' });

    expect(result).toBeNull();
  });

  it('replaces a pickJson call with an inlined object literal', () => {
    const onLoad = captureOnLoad();
    const sourceCode = `const meta = pickJson('./package.json', ['name', 'version']);`;
    const jsonContent = JSON.stringify({ name: 'my-pkg', version: '1.0.0', license: 'MIT' });

    mockReadFileSync.mockReturnValueOnce(sourceCode).mockReturnValueOnce(jsonContent);

    const result = onLoad({ path: '/project/src/kit.ts' });

    expect(result).not.toBeNull();
    expect(result?.contents).toBe(`const meta = ${JSON.stringify({ name: 'my-pkg', version: '1.0.0' })};`);
    expect(result?.loader).toBe('ts');
  });

  it('replaces multiple pickJson calls in a single file', () => {
    const onLoad = captureOnLoad();
    const sourceCode = [`const a = pickJson('./a.json', ['x']);`, `const b = pickJson('./b.json', ['y']);`].join('\n');
    const jsonA = JSON.stringify({ x: 1, extra: true });
    const jsonB = JSON.stringify({ y: 2, extra: true });

    mockReadFileSync.mockReturnValueOnce(sourceCode).mockReturnValueOnce(jsonA).mockReturnValueOnce(jsonB);

    const result = onLoad({ path: '/project/src/kit.ts' });

    expect(result).not.toBeNull();
    expect(result?.contents).toContain(JSON.stringify({ x: 1 }));
    expect(result?.contents).toContain(JSON.stringify({ y: 2 }));
  });

  it('extracts nested paths from JSON', () => {
    const onLoad = captureOnLoad();
    const sourceCode = `const meta = pickJson('./data.json', [['config', 'debug']]);`;
    const jsonContent = JSON.stringify({ config: { debug: true, verbose: false } });

    mockReadFileSync.mockReturnValueOnce(sourceCode).mockReturnValueOnce(jsonContent);

    const result = onLoad({ path: '/project/src/kit.ts' });

    expect(result).not.toBeNull();
    expect(result?.contents).toBe(`const meta = ${JSON.stringify({ config: { debug: true } })};`);
  });

  it('resolves the JSON path relative to the source file', () => {
    const onLoad = captureOnLoad();
    const sourceCode = `const meta = pickJson('../data.json', ['name']);`;
    const jsonContent = JSON.stringify({ name: 'root-pkg' });

    mockReadFileSync.mockReturnValueOnce(sourceCode).mockReturnValueOnce(jsonContent);

    onLoad({ path: '/project/src/kit.ts' });

    // Second call to readFileSync is for the JSON file.
    expect(mockReadFileSync).toHaveBeenCalledWith('/project/data.json', 'utf8');
  });

  it('throws when the JSON file cannot be read', () => {
    const onLoad = captureOnLoad();
    const sourceCode = `const meta = pickJson('./missing.json', ['name']);`;

    mockReadFileSync.mockReturnValueOnce(sourceCode).mockImplementationOnce(() => {
      throw new Error('ENOENT');
    });

    expect(() => onLoad({ path: '/project/src/kit.ts' })).toThrow('Cannot read JSON file');
  });

  it('throws when a requested path is not found in the JSON', () => {
    const onLoad = captureOnLoad();
    const sourceCode = `const meta = pickJson('./data.json', ['missing']);`;
    const jsonContent = JSON.stringify({ name: 'my-pkg' });

    mockReadFileSync.mockReturnValueOnce(sourceCode).mockReturnValueOnce(jsonContent);

    expect(() => onLoad({ path: '/project/src/kit.ts' })).toThrow('Path not found in JSON: missing');
  });

  it('throws when pickJson arguments cannot be parsed', () => {
    const onLoad = captureOnLoad();
    const sourceCode = `const meta = pickJson(someVar, ['name']);`;

    mockReadFileSync.mockReturnValueOnce(sourceCode);

    expect(() => onLoad({ path: '/project/src/kit.ts' })).toThrow('Cannot parse pickJson arguments');
  });

  it('throws when the JSON file contains invalid JSON', () => {
    const onLoad = captureOnLoad();
    const sourceCode = `const meta = pickJson('./bad.json', ['name']);`;

    mockReadFileSync.mockReturnValueOnce(sourceCode).mockReturnValueOnce('{broken');

    expect(() => onLoad({ path: '/project/src/kit.ts' })).toThrow('Invalid JSON');
  });

  it('throws when the JSON root is not an object', () => {
    const onLoad = captureOnLoad();
    const sourceCode = `const meta = pickJson('./array.json', ['name']);`;

    mockReadFileSync.mockReturnValueOnce(sourceCode).mockReturnValueOnce('[1,2,3]');

    expect(() => onLoad({ path: '/project/src/kit.ts' })).toThrow('Expected a JSON object');
  });

  it('throws when a path element is neither a string nor a string array', () => {
    const onLoad = captureOnLoad();
    const sourceCode = `const meta = pickJson('./data.json', [42]);`;

    mockReadFileSync.mockReturnValueOnce(sourceCode);

    expect(() => onLoad({ path: '/project/src/kit.ts' })).toThrow('Invalid path in pickJson paths array');
  });

  it('throws when the source file cannot be read', () => {
    const onLoad = captureOnLoad();

    mockReadFileSync.mockImplementationOnce(() => {
      throw new Error('EACCES');
    });

    expect(() => onLoad({ path: '/project/src/kit.ts' })).toThrow('Cannot read source file');
  });

  it('returns null when pickJson appears only in a comment', () => {
    const onLoad = captureOnLoad();
    mockReadFileSync.mockReturnValue('// pickJson is handled at compile time\nconst x = 1;');

    const result = onLoad({ path: '/project/src/kit.ts' });

    expect(result).toBeNull();
  });

  it('supports single-quoted string arguments', () => {
    const onLoad = captureOnLoad();
    const sourceCode = `const meta = pickJson('./data.json', ['name']);`;
    const jsonContent = JSON.stringify({ name: 'my-pkg', version: '1.0.0' });

    mockReadFileSync.mockReturnValueOnce(sourceCode).mockReturnValueOnce(jsonContent);

    const result = onLoad({ path: '/project/src/kit.ts' });

    expect(result).not.toBeNull();
    expect(result?.contents).toContain('"name":"my-pkg"');
  });

  it('registers onLoad filter for TypeScript extensions only', () => {
    let capturedFilter: RegExp | undefined;
    const plugin = pickJsonPlugin();
    void plugin.setup({
      onLoad(options: { filter: RegExp }, _callback: LoadCallback) {
        capturedFilter = options.filter;
      },
    });

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
