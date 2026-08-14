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

  it('carries the install command as a hint rather than in the message', async () => {
    mockExistsSync.mockImplementation((target: string) => target.endsWith('pnpm-lock.yaml'));
    mockImport.mockRejectedValue(
      Object.assign(new Error("Cannot find package 'readyup'"), { code: 'ERR_MODULE_NOT_FOUND' }),
    );

    const error = await captureError(() => jitiImport(KIT_PATH, DETAIL, 'Kit file'));

    expect(extractHint(error)).toBe('Install it with: pnpm add --save-dev readyup');
    expect(error.message).not.toContain('Install it with');
  });

  it('omits the install command for a specifier that names a file rather than a package', async () => {
    mockExistsSync.mockReturnValue(false);
    mockImport.mockRejectedValue(
      Object.assign(new Error("Cannot find module './helpers.ts'"), { code: 'MODULE_NOT_FOUND' }),
    );

    const error = await captureError(() => jitiImport(KIT_PATH, DETAIL, 'Kit file'));

    expect(String(error)).toContain("Cannot resolve './helpers.ts' while evaluating .readyup/kits/default.ts.");
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
