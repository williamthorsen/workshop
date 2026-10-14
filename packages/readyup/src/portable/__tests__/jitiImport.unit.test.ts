import path from 'node:path';

import { captureError } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockExistsSync = vi.hoisted(() => vi.fn());
const mockImport = vi.hoisted(() => vi.fn());

vi.mock(import('node:fs'), () => ({
  existsSync: mockExistsSync,
}));

vi.mock('jiti', () => ({
  createJiti: () => ({ import: mockImport }),
}));

import { extractHint } from '../../errors/error-handling.ts';
import { jitiImport } from '../jitiImport.ts';
import { UnresolvedModuleError } from '../UnresolvedModuleError.ts';

const KIT_PATH = path.resolve(process.cwd(), '.readyup/kits/default.ts');
const DETAIL = 'Uncompiled kits require the package to be installed as a project dependency.';

describe(jitiImport, () => {
  afterEach(() => {
    mockExistsSync.mockReset();
    mockImport.mockReset();
  });

  it('names the evaluated file and the caller detail', async () => {
    mockExistsSync.mockImplementation((target: string) => target.endsWith('pnpm-lock.yaml'));
    mockImport.mockRejectedValue(
      Object.assign(new Error("Cannot find package 'readyup'"), { code: 'ERR_MODULE_NOT_FOUND' }),
    );

    await expect(jitiImport(KIT_PATH, DETAIL, 'Kit file')).rejects.toThrow(
      `Cannot resolve 'readyup' while evaluating .readyup/kits/default.ts. ${DETAIL}`,
    );
  });

  it('reports the install command as a hint rather than in the message', async () => {
    mockExistsSync.mockImplementation((target: string) => target.endsWith('pnpm-lock.yaml'));
    mockImport.mockRejectedValue(
      Object.assign(new Error("Cannot find package 'readyup'"), { code: 'ERR_MODULE_NOT_FOUND' }),
    );

    const error = await captureError(() => jitiImport(KIT_PATH, DETAIL, 'Kit file'));

    expect(extractHint(error)).toBe('Install it with: pnpm add --save-dev readyup');
    expect(error.message).not.toContain('Install it with');
  });

  it('reports a relative specifier as a missing file, naming the file that imports it', async () => {
    mockExistsSync.mockReturnValue(false);
    const importer = path.resolve(process.cwd(), '.readyup/kits/lib/helper.ts');
    mockImport.mockRejectedValue(
      Object.assign(new Error(`Cannot find module './nope'\nRequire stack:\n- ${importer}\n- ${KIT_PATH}`), {
        code: 'MODULE_NOT_FOUND',
      }),
    );

    const error = await captureError(UnresolvedModuleError, () => jitiImport(KIT_PATH, DETAIL, 'Kit file'));

    expect(error.message).toBe(
      "Cannot find './nope', imported by .readyup/kits/lib/helper.ts. Check the path and the file name.",
    );
    expect(extractHint(error)).toBeUndefined();
  });

  it('names the evaluated file as the importer when the error lists no require stack', async () => {
    mockExistsSync.mockReturnValue(false);
    mockImport.mockRejectedValue(
      Object.assign(new Error("Cannot find module './helpers.ts'"), { code: 'MODULE_NOT_FOUND' }),
    );

    const error = await captureError(() => jitiImport(KIT_PATH, DETAIL, 'Kit file'));

    expect(error.message).toBe(
      "Cannot find './helpers.ts', imported by .readyup/kits/default.ts. Check the path and the file name.",
    );
  });

  it('reports an absolute specifier as a missing file', async () => {
    mockExistsSync.mockReturnValue(false);
    mockImport.mockRejectedValue(
      Object.assign(new Error("Cannot find module '/opt/kits/shared.ts'"), { code: 'MODULE_NOT_FOUND' }),
    );

    const error = await captureError(() => jitiImport(KIT_PATH, DETAIL, 'Kit file'));

    expect(error.message).toContain("Cannot find '/opt/kits/shared.ts', imported by .readyup/kits/default.ts.");
    expect(error.message).not.toContain(DETAIL);
  });

  it('omits the install command for a builtin specifier', async () => {
    mockExistsSync.mockReturnValue(false);
    mockImport.mockRejectedValue(
      Object.assign(new Error("Cannot find module 'node:nope'"), { code: 'ERR_MODULE_NOT_FOUND' }),
    );

    const error = await captureError(() => jitiImport(KIT_PATH, DETAIL, 'Kit file'));

    expect(error.message).toBe(`Cannot resolve 'node:nope' while evaluating .readyup/kits/default.ts. ${DETAIL}`);
    expect(extractHint(error)).toBeUndefined();
  });

  it('omits the install command when the specifier cannot be read from the error', async () => {
    mockExistsSync.mockReturnValue(false);
    mockImport.mockRejectedValue(Object.assign(new Error('Module load failed'), { code: 'MODULE_NOT_FOUND' }));

    const error = await captureError(() => jitiImport(KIT_PATH, DETAIL, 'Kit file'));

    expect(String(error)).toContain("Cannot resolve 'unknown module' while evaluating .readyup/kits/default.ts.");
    expect(extractHint(error)).toBeUndefined();
  });

  it('re-throws an error that is not a module-resolution failure', async () => {
    mockImport.mockRejectedValue(new SyntaxError('Unexpected token'));

    await expect(jitiImport(KIT_PATH, DETAIL, 'Kit file')).rejects.toThrow(SyntaxError);
  });

  it('rejects a module that does not export an object', async () => {
    mockImport.mockResolvedValue('not-an-object');

    await expect(jitiImport(KIT_PATH, DETAIL, 'Kit file')).rejects.toThrow(
      'Kit file must export an object, got string',
    );
  });

  it('returns the imported module namespace', async () => {
    mockImport.mockResolvedValue({ checklists: [] });

    await expect(jitiImport(KIT_PATH, DETAIL, 'Kit file')).resolves.toStrictEqual({ checklists: [] });
  });
});
