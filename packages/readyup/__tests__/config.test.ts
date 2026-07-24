import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const mockExistsSync = vi.hoisted(() => vi.fn());
const mockJitiImport = vi.hoisted(() => vi.fn());
const mockReaddirSync = vi.hoisted(() => vi.fn());

vi.mock(import('node:fs'), () => ({
  existsSync: mockExistsSync,
  readdirSync: mockReaddirSync,
}));

vi.mock('jiti', () => ({
  createJiti: () => ({ import: mockJitiImport }),
}));

import { loadRdyKit } from '../src/config.ts';

const KIT_PATH = '.readyup/kits/default.ts';

describe(loadRdyKit, () => {
  afterEach(() => {
    mockExistsSync.mockReset();
    mockJitiImport.mockReset();
    mockReaddirSync.mockReset();
  });

  it('reports an uncompiled kit when only the TypeScript source exists', async () => {
    mockExistsSync.mockImplementation((target: string) => target.endsWith('.ts'));

    await expect(loadRdyKit('.readyup/kits/deploy.js')).rejects.toThrow(
      "Kit \"deploy\" is not compiled. Run 'rdy compile' to compile it, or 'rdy run --jit' to run it from source.",
    );
  });

  it('reports a compiled-only kit when its source is requested', async () => {
    mockExistsSync.mockImplementation((target: string) => target.endsWith('.js'));

    await expect(loadRdyKit('.readyup/kits/deploy.ts')).rejects.toThrow(
      'Kit "deploy" has no source at .readyup/kits/deploy.ts, but a compiled kit exists. ' +
        "Run 'rdy run' without --jit to use it.",
    );
  });

  it("suggests 'rdy init' when the kit directory holds no kits at all", async () => {
    mockExistsSync.mockReturnValue(false);
    mockReaddirSync.mockReturnValue([]);

    await expect(loadRdyKit('.readyup/kits/default.js')).rejects.toThrow(
      'Kit "default" not found at .readyup/kits/default.js. Run \'rdy init\' to create one.',
    );
  });

  it('names the available kits rather than suggesting init when the default kit is missing but others exist', async () => {
    mockExistsSync.mockReturnValue(false);
    mockReaddirSync.mockReturnValue(buildDirents('deploy.js', 'release.js'));

    const error = await loadRdyKit('.readyup/kits/default.js').catch((error_: unknown) => error_);

    expect(String(error)).toContain(
      'Kit "default" not found at .readyup/kits/default.js. Available kits: deploy, release.',
    );
    expect(String(error)).not.toContain('rdy init');
  });

  it('names the searched path and the available kits for any other missing kit', async () => {
    mockExistsSync.mockReturnValue(false);
    mockReaddirSync.mockReturnValue(buildDirents('deploy.js', 'release.js'));

    await expect(loadRdyKit('.readyup/kits/deply.js')).rejects.toThrow(
      'Kit "deply" not found at .readyup/kits/deply.js. Available kits: deploy, release.',
    );
  });

  it('names the searched directory when no kits sit beside the missing one', async () => {
    mockExistsSync.mockReturnValue(false);
    mockReaddirSync.mockReturnValue([]);

    await expect(loadRdyKit('custom/path.ts')).rejects.toThrow(
      'Kit "path" not found at custom/path.ts. No kits found in custom.',
    );
  });

  it('treats an unreadable kit directory as holding no kits', async () => {
    mockExistsSync.mockReturnValue(false);
    mockReaddirSync.mockImplementation(() => {
      throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
    });

    await expect(loadRdyKit('custom/path.ts')).rejects.toThrow(
      'Kit "path" not found at custom/path.ts. No kits found in custom.',
    );
  });

  it.each(['MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND'])(
    'catches %s errors with an actionable message',
    async (code) => {
      mockExistsSync.mockReturnValue(true);
      const moduleError = Object.assign(new Error("Cannot find package 'readyup'"), { code });
      mockJitiImport.mockRejectedValue(moduleError);

      await expect(loadRdyKit(KIT_PATH)).rejects.toThrow(
        /Cannot resolve 'readyup'.*installed as a project dependency.*'rdy compile'/,
      );
    },
  );

  it('falls back to "unknown module" when the error message does not match the expected pattern', async () => {
    mockExistsSync.mockReturnValue(true);
    const moduleError = Object.assign(new Error('Module load failed'), { code: 'MODULE_NOT_FOUND' });
    mockJitiImport.mockRejectedValue(moduleError);

    await expect(loadRdyKit(KIT_PATH)).rejects.toThrow(
      /Cannot resolve 'unknown module'.*installed as a project dependency/,
    );
  });

  it('re-throws non-module-resolution errors from jiti', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockRejectedValue(new SyntaxError('Unexpected token'));

    await expect(loadRdyKit(KIT_PATH)).rejects.toThrow(SyntaxError);
  });

  it('resolves the kit path against process.cwd()', async () => {
    const expectedPath = path.resolve(process.cwd(), KIT_PATH);
    const validChecklists = [{ name: 'test', checks: [{ name: 'a', check: () => true }] }];
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ checklists: validChecklists });

    await loadRdyKit(KIT_PATH);

    expect(mockExistsSync).toHaveBeenCalledWith(expectedPath);
  });

  it('uses a custom kit path when provided', async () => {
    const customPath = 'custom/config.ts';
    const expectedPath = path.resolve(process.cwd(), customPath);
    const validChecklists = [{ name: 'test', checks: [{ name: 'a', check: () => true }] }];
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ checklists: validChecklists });

    await loadRdyKit(customPath);

    expect(mockExistsSync).toHaveBeenCalledWith(expectedPath);
  });

  it('throws when jiti returns a non-object', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue('not-an-object');

    await expect(loadRdyKit(KIT_PATH)).rejects.toThrow('Kit file must export an object, got string');
  });

  it('throws when no checklists export exists', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ unrelated: true });

    await expect(loadRdyKit(KIT_PATH)).rejects.toThrow('Kit file must export checklists');
  });

  it('rejects a kit whose check declares an unknown severity', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({
      checklists: [{ name: 'test', checks: [{ name: 'a', check: () => true, severity: 'info' }] }],
    });

    await expect(loadRdyKit(KIT_PATH)).rejects.toThrow(
      'checklists[0].checks[0].severity: expected one of "error", "warn", "recommend", got "info"',
    );
  });

  it('names the kit path in a validation failure', async () => {
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({
      checklists: [{ name: 'test', checks: [{ name: 'a', check: 'not-a-function' }] }],
    });

    await expect(loadRdyKit(KIT_PATH)).rejects.toThrow(`Invalid kit at ${KIT_PATH}:`);
  });

  it('loads a kit from a default export', async () => {
    const validChecklists = [{ name: 'test', checks: [{ name: 'a', check: () => true }] }];
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ default: { checklists: validChecklists } });

    const { kit } = await loadRdyKit(KIT_PATH);

    expect(kit.checklists).toHaveLength(1);
    expect(kit.checklists[0]?.name).toBe('test');
  });

  it('loads a kit from a default export with fixLocation', async () => {
    const validChecklists = [{ name: 'test', checks: [{ name: 'a', check: () => true }] }];
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ default: { checklists: validChecklists, fixLocation: 'inline' } });

    const { kit } = await loadRdyKit(KIT_PATH);

    expect(kit.fixLocation).toBe('inline');
  });

  it('returns a valid kit with flat checklists', async () => {
    const validChecklists = [{ name: 'test', checks: [{ name: 'a', check: () => true }] }];
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ checklists: validChecklists });

    const { kit } = await loadRdyKit(KIT_PATH);

    expect(kit.checklists).toHaveLength(1);
    expect(kit.checklists[0]?.name).toBe('test');
  });

  it('carries through fixLocation when present', async () => {
    const validChecklists = [{ name: 'test', checks: [{ name: 'a', check: () => true }] }];
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ checklists: validChecklists, fixLocation: 'inline' });

    const { kit } = await loadRdyKit(KIT_PATH);

    expect(kit.fixLocation).toBe('inline');
  });

  it('omits fixLocation when the module does not export it', async () => {
    const validChecklists = [{ name: 'test', checks: [{ name: 'a', check: () => true }] }];
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ checklists: validChecklists });

    const { kit } = await loadRdyKit(KIT_PATH);

    expect(kit.fixLocation).toBeUndefined();
  });

  it('returns compileTimeVersion when __readyupVersion is exported as a string', async () => {
    const validChecklists = [{ name: 'test', checks: [{ name: 'a', check: () => true }] }];
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ checklists: validChecklists, __readyupVersion: '0.19.2' });

    const { compileTimeVersion } = await loadRdyKit(KIT_PATH);

    expect(compileTimeVersion).toBe('0.19.2');
  });

  it('returns undefined compileTimeVersion when __readyupVersion is absent', async () => {
    const validChecklists = [{ name: 'test', checks: [{ name: 'a', check: () => true }] }];
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ checklists: validChecklists });

    const { compileTimeVersion } = await loadRdyKit(KIT_PATH);

    expect(compileTimeVersion).toBeUndefined();
  });

  it('returns undefined compileTimeVersion when __readyupVersion is not a string', async () => {
    const validChecklists = [{ name: 'test', checks: [{ name: 'a', check: () => true }] }];
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ checklists: validChecklists, __readyupVersion: 42 });

    const { compileTimeVersion } = await loadRdyKit(KIT_PATH);

    expect(compileTimeVersion).toBeUndefined();
  });
});

/** Build the `withFileTypes` entries `readdirSync` returns for a set of regular files. */
function buildDirents(...names: string[]): Array<{ name: string; isFile: () => boolean }> {
  return names.map((name) => ({ name, isFile: () => true }));
}
