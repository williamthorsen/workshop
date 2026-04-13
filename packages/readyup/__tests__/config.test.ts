import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const mockExistsSync = vi.hoisted(() => vi.fn());
const mockJitiImport = vi.hoisted(() => vi.fn());

vi.mock(import('node:fs'), () => ({
  existsSync: mockExistsSync,
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
  });

  it('throws when the kit file does not exist', async () => {
    mockExistsSync.mockReturnValue(false);

    await expect(loadRdyKit('missing/kit.ts')).rejects.toThrow('Kit not found');
  });

  it('throws with a rdy init hint when a convention-path kit is missing', async () => {
    mockExistsSync.mockReturnValue(false);

    await expect(loadRdyKit('.readyup/kits/default.ts')).rejects.toThrow(
      'Kit "default" not found. Run \'rdy init\' to create one.',
    );
  });

  it('shows the user-provided path in file-not-found errors', async () => {
    mockExistsSync.mockReturnValue(false);

    await expect(loadRdyKit('custom/path.ts')).rejects.toThrow('Kit not found: custom/path.ts');
  });

  it('includes the path in file-not-found errors for non-convention paths', async () => {
    mockExistsSync.mockReturnValue(false);

    await expect(loadRdyKit('some/other.ts')).rejects.toThrow('Kit not found: some/other.ts');
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

  it('loads a kit from a default export', async () => {
    const validChecklists = [{ name: 'test', checks: [{ name: 'a', check: () => true }] }];
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ default: { checklists: validChecklists } });

    const kit = await loadRdyKit(KIT_PATH);

    expect(kit.checklists).toHaveLength(1);
    expect(kit.checklists[0]?.name).toBe('test');
  });

  it('loads a kit from a default export with fixLocation', async () => {
    const validChecklists = [{ name: 'test', checks: [{ name: 'a', check: () => true }] }];
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ default: { checklists: validChecklists, fixLocation: 'inline' } });

    const kit = await loadRdyKit(KIT_PATH);

    expect(kit.fixLocation).toBe('inline');
  });

  it('returns a valid kit with flat checklists', async () => {
    const validChecklists = [{ name: 'test', checks: [{ name: 'a', check: () => true }] }];
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ checklists: validChecklists });

    const kit = await loadRdyKit(KIT_PATH);

    expect(kit.checklists).toHaveLength(1);
    expect(kit.checklists[0]?.name).toBe('test');
  });

  it('carries through fixLocation when present', async () => {
    const validChecklists = [{ name: 'test', checks: [{ name: 'a', check: () => true }] }];
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ checklists: validChecklists, fixLocation: 'inline' });

    const kit = await loadRdyKit(KIT_PATH);

    expect(kit.fixLocation).toBe('inline');
  });

  it('omits fixLocation when the module does not export it', async () => {
    const validChecklists = [{ name: 'test', checks: [{ name: 'a', check: () => true }] }];
    mockExistsSync.mockReturnValue(true);
    mockJitiImport.mockResolvedValue({ checklists: validChecklists });

    const kit = await loadRdyKit(KIT_PATH);

    expect(kit.fixLocation).toBeUndefined();
  });
});
