import path from 'node:path';

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

import { loadConfig } from '../loadConfig.ts';
import { captureError } from '../test-utils/captureError.ts';
import { extractHint, extractMessage } from '../utils/error-handling.ts';

describe(loadConfig, () => {
  afterEach(() => {
    mockExistsSync.mockReset();
    mockJitiImport.mockReset();
  });

  it('returns defaults when no config file exists', async () => {
    mockExistsSync.mockReturnValue(false);

    const config = await loadConfig();

    expect(config).toStrictEqual({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
      internal: { dir: '.', infix: undefined },
      packages: [],
    });
  });

  it('loads from .config/readyup.config.ts when it exists', async () => {
    mockExistsSync.mockImplementation((p: string) => p.includes('.config/readyup.config.ts'));
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

    const config = await loadConfig({ overridePath: 'my/config.ts' });

    expect(config.compile.srcDir).toBe('override/src');
  });

  it('throws when override path does not exist', async () => {
    mockExistsSync.mockReturnValue(false);

    await expect(loadConfig({ overridePath: 'missing/config.ts' })).rejects.toThrow('Config not found');
  });

  describe('fromDir', () => {
    it('looks the config up under the named directory rather than the working directory', async () => {
      mockExistsSync.mockReturnValue(true);
      mockJitiImport.mockResolvedValue({ default: {} });

      await loadConfig({ fromDir: '/repo/packages/tooling' });

      expect(mockJitiImport).toHaveBeenCalledWith(path.join('/repo/packages/tooling', '.config/readyup.config.ts'));
    });

    it('resolves an override path against the named directory', async () => {
      mockExistsSync.mockReturnValue(true);
      mockJitiImport.mockResolvedValue({ default: {} });

      await loadConfig({ fromDir: '/repo/packages/tooling', overridePath: 'custom.config.ts' });

      expect(mockJitiImport).toHaveBeenCalledWith(path.join('/repo/packages/tooling', 'custom.config.ts'));
    });

    it('reads a directory other than the working one without moving the process', async () => {
      const originalCwd = process.cwd();
      mockExistsSync.mockReturnValue(true);
      mockJitiImport.mockResolvedValue({ default: { compile: { srcDir: 'elsewhere/src' } } });

      const config = await loadConfig({ fromDir: '/repo/packages/tooling' });

      expect(config.compile.srcDir).toBe('elsewhere/src');
      expect(process.cwd()).toBe(originalCwd);
    });

    it('falls back to the working directory when no directory is named', async () => {
      mockExistsSync.mockReturnValue(true);
      mockJitiImport.mockResolvedValue({ default: {} });

      await loadConfig();

      expect(mockJitiImport).toHaveBeenCalledWith(path.join(process.cwd(), '.config/readyup.config.ts'));
    });
  });

  it('throws when config file exports a non-object', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue('not-an-object');

    await expect(loadConfig({ overridePath: 'config.ts' })).rejects.toThrow('Config file must export an object');
  });

  it('throws when compile is not an object', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ compile: 'bad' });

    await expect(loadConfig({ overridePath: 'config.ts' })).rejects.toThrow(ZodError);
  });

  it('throws when compile.srcDir is not a string', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ compile: { srcDir: 42 } });

    await expect(loadConfig({ overridePath: 'config.ts' })).rejects.toThrow(ZodError);
  });

  it('throws when compile.outDir is not a string', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ compile: { outDir: false } });

    await expect(loadConfig({ overridePath: 'config.ts' })).rejects.toThrow(ZodError);
  });

  it('applies defaults for missing compile fields', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ default: {} });

    const config = await loadConfig({ overridePath: 'config.ts' });

    expect(config.compile.srcDir).toBe('.readyup/kits');
    expect(config.compile.outDir).toBe('.readyup/kits');
  });

  it('loads compile.include from config', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({
      default: { compile: { include: 'shared/**/*.ts' } },
    });

    const config = await loadConfig({ overridePath: 'config.ts' });

    expect(config.compile.include).toBe('shared/**/*.ts');
  });

  it.each(['MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND'])(
    'catches %s errors with an actionable message',
    async (code) => {
      mockExistsSync.mockReturnValue(true);
      const moduleError = Object.assign(new Error("Cannot find package 'some-lib'"), { code });
      mockJitiImport.mockRejectedValue(moduleError);

      await expect(loadConfig({ overridePath: 'config.ts' })).rejects.toThrow(
        /Cannot resolve 'some-lib'.*must be installed in the project/,
      );
    },
  );

  it('names the config file in a module-resolution failure, with the install command as a hint', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockRejectedValue(
      Object.assign(new Error("Cannot find package 'some-lib'"), { code: 'ERR_MODULE_NOT_FOUND' }),
    );

    const error = await captureError(() => loadConfig({ overridePath: 'config.ts' }));

    expect(extractMessage(error)).toBe(
      "Cannot resolve 'some-lib' while evaluating config.ts. External packages imported by the config file " +
        'must be installed in the project.',
    );
    expect(extractHint(error)).toBe('Install it with: pnpm add --save-dev some-lib');
  });

  it('falls back to "unknown module" when the error message does not match the expected pattern', async () => {
    mockExistsSync.mockReturnValue(true);
    const moduleError = Object.assign(new Error('Module load failed'), { code: 'MODULE_NOT_FOUND' });
    mockJitiImport.mockRejectedValue(moduleError);

    await expect(loadConfig({ overridePath: 'config.ts' })).rejects.toThrow(
      /Cannot resolve 'unknown module'.*must be installed in the project/,
    );
  });

  it('re-throws non-module-resolution errors from jiti', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockRejectedValue(new SyntaxError('Unexpected token'));

    await expect(loadConfig({ overridePath: 'config.ts' })).rejects.toThrow(SyntaxError);
  });

  it('supports named exports (no default)', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ compile: { srcDir: 'named/src', outDir: 'named/out' } });

    const config = await loadConfig({ overridePath: 'config.ts' });

    expect(config.compile.srcDir).toBe('named/src');
    expect(config.compile.outDir).toBe('named/out');
  });

  it('resolves internal block from config', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({
      default: { internal: { dir: 'internal', infix: 'int' } },
    });

    const config = await loadConfig({ overridePath: 'config.ts' });

    expect(config.internal.dir).toBe('internal');
    expect(config.internal.infix).toBe('int');
  });

  it('resolves the packages list from config', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ default: { packages: ['@williamthorsen/nmr', 'readyup'] } });

    const config = await loadConfig({ overridePath: 'config.ts' });

    expect(config.packages).toStrictEqual(['@williamthorsen/nmr', 'readyup']);
  });

  it('resolves packages to an empty list when the key is absent', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ default: {} });

    const config = await loadConfig({ overridePath: 'config.ts' });

    expect(config.packages).toStrictEqual([]);
  });

  it('throws when packages is not an array', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ default: { packages: '@williamthorsen/nmr' } });

    await expect(loadConfig({ overridePath: 'config.ts' })).rejects.toThrow(ZodError);
  });

  it('throws when a packages entry is not a string', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ default: { packages: ['readyup', 42] } });

    await expect(loadConfig({ overridePath: 'config.ts' })).rejects.toThrow(ZodError);
  });

  it('applies internal defaults when internal block is absent', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ default: {} });

    const config = await loadConfig({ overridePath: 'config.ts' });

    expect(config.internal.dir).toBe('.');
    expect(config.internal.infix).toBeUndefined();
  });

  it('applies internal defaults for missing fields within internal block', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ default: { internal: { dir: 'custom' } } });

    const config = await loadConfig({ overridePath: 'config.ts' });

    expect(config.internal.dir).toBe('custom');
    expect(config.internal.infix).toBeUndefined();
  });

  it('throws when internal.dir is not a string', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ default: { internal: { dir: 42 } } });

    await expect(loadConfig({ overridePath: 'config.ts' })).rejects.toThrow(ZodError);
  });

  it('throws when internal.infix is not a string', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ default: { internal: { infix: false } } });

    await expect(loadConfig({ overridePath: 'config.ts' })).rejects.toThrow(ZodError);
  });
});
