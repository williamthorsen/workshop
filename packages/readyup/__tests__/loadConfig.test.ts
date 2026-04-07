import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

const mockExistsSync = vi.hoisted(() => vi.fn());
const mockJitiImport = vi.hoisted(() => vi.fn());

vi.mock(import('node:fs'), () => ({
  existsSync: mockExistsSync,
}));

vi.mock('jiti', () => ({
  createJiti: () => ({ import: mockJitiImport }),
}));

import { loadConfig } from '../src/loadConfig.ts';

describe(loadConfig, () => {
  afterEach(() => {
    mockExistsSync.mockReset();
    mockJitiImport.mockReset();
  });

  it('returns defaults when no config file exists', async () => {
    mockExistsSync.mockReturnValue(false);

    const config = await loadConfig();

    expect(config).toStrictEqual({
      compile: { srcDir: '.rdy/kits', outDir: '.rdy/kits', include: undefined },
      internal: { dir: '.', extension: '.ts' },
    });
  });

  it('loads from .config/rdy.config.ts when it exists', async () => {
    mockExistsSync.mockImplementation((p: string) => p.includes('.config/rdy.config.ts'));
    mockJitiImport.mockResolvedValue({
      default: { compile: { srcDir: 'src/collections', outDir: 'dist/collections' } },
    });

    const config = await loadConfig();

    expect(config.compile.srcDir).toBe('src/collections');
    expect(config.compile.outDir).toBe('dist/collections');
  });

  it('uses override path and skips lookup chain', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({
      default: { compile: { srcDir: 'override/src', outDir: 'override/out' } },
    });

    const config = await loadConfig('my/config.ts');

    expect(config.compile.srcDir).toBe('override/src');
  });

  it('throws when override path does not exist', async () => {
    mockExistsSync.mockReturnValue(false);

    await expect(loadConfig('missing/config.ts')).rejects.toThrow('Config not found');
  });

  it('throws when config file exports a non-object', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue('not-an-object');

    await expect(loadConfig('config.ts')).rejects.toThrow('Config file must export an object');
  });

  it('throws when compile is not an object', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ compile: 'bad' });

    await expect(loadConfig('config.ts')).rejects.toThrow(ZodError);
  });

  it('throws when compile.srcDir is not a string', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ compile: { srcDir: 42 } });

    await expect(loadConfig('config.ts')).rejects.toThrow(ZodError);
  });

  it('throws when compile.outDir is not a string', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ compile: { outDir: false } });

    await expect(loadConfig('config.ts')).rejects.toThrow(ZodError);
  });

  it('applies defaults for missing compile fields', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ default: {} });

    const config = await loadConfig('config.ts');

    expect(config.compile.srcDir).toBe('.rdy/kits');
    expect(config.compile.outDir).toBe('.rdy/kits');
  });

  it('loads compile.include from config', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({
      default: { compile: { include: 'shared/**/*.ts' } },
    });

    const config = await loadConfig('config.ts');

    expect(config.compile.include).toBe('shared/**/*.ts');
  });

  it.each(['MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND'])(
    'catches %s errors with an actionable message',
    async (code) => {
      mockExistsSync.mockReturnValue(true);
      const moduleError = Object.assign(new Error("Cannot find package 'some-lib'"), { code });
      mockJitiImport.mockRejectedValue(moduleError);

      await expect(loadConfig('config.ts')).rejects.toThrow(
        /Cannot resolve 'some-lib'.*must be installed in the project/,
      );
    },
  );

  it('falls back to "unknown module" when the error message does not match the expected pattern', async () => {
    mockExistsSync.mockReturnValue(true);
    const moduleError = Object.assign(new Error('Module load failed'), { code: 'MODULE_NOT_FOUND' });
    mockJitiImport.mockRejectedValue(moduleError);

    await expect(loadConfig('config.ts')).rejects.toThrow(
      /Cannot resolve 'unknown module'.*must be installed in the project/,
    );
  });

  it('re-throws non-module-resolution errors from jiti', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockRejectedValue(new SyntaxError('Unexpected token'));

    await expect(loadConfig('config.ts')).rejects.toThrow(SyntaxError);
  });

  it('supports named exports (no default)', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ compile: { srcDir: 'named/src', outDir: 'named/out' } });

    const config = await loadConfig('config.ts');

    expect(config.compile.srcDir).toBe('named/src');
    expect(config.compile.outDir).toBe('named/out');
  });

  it('resolves internal block from config', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({
      default: { internal: { dir: 'internal', extension: '.int.ts' } },
    });

    const config = await loadConfig('config.ts');

    expect(config.internal.dir).toBe('internal');
    expect(config.internal.extension).toBe('.int.ts');
  });

  it('applies internal defaults when internal block is absent', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ default: {} });

    const config = await loadConfig('config.ts');

    expect(config.internal.dir).toBe('.');
    expect(config.internal.extension).toBe('.ts');
  });

  it('applies internal defaults for missing fields within internal block', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ default: { internal: { dir: 'custom' } } });

    const config = await loadConfig('config.ts');

    expect(config.internal.dir).toBe('custom');
    expect(config.internal.extension).toBe('.ts');
  });

  it('throws when internal.dir is not a string', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ default: { internal: { dir: 42 } } });

    await expect(loadConfig('config.ts')).rejects.toThrow(ZodError);
  });

  it('throws when internal.extension is not a string', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ default: { internal: { extension: false } } });

    await expect(loadConfig('config.ts')).rejects.toThrow(ZodError);
  });
});
