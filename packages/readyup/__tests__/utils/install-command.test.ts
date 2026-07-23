import { afterEach, describe, expect, it, vi } from 'vitest';

const mockExistsSync = vi.hoisted(() => vi.fn());

vi.mock(import('node:fs'), () => ({
  existsSync: mockExistsSync,
}));

import { buildInstallCommand } from '../../src/utils/install-command.ts';

describe(buildInstallCommand, () => {
  afterEach(() => {
    mockExistsSync.mockReset();
  });

  it('uses pnpm when a pnpm lockfile is present', () => {
    mockExistsSync.mockImplementation((target: string) => target.endsWith('pnpm-lock.yaml'));

    expect(buildInstallCommand('readyup')).toBe('pnpm add --save-dev readyup');
  });

  it('uses yarn when a yarn lockfile is present', () => {
    mockExistsSync.mockImplementation((target: string) => target.endsWith('yarn.lock'));

    expect(buildInstallCommand('readyup')).toBe('yarn add --dev readyup');
  });

  it('falls back to npm when no lockfile identifies a package manager', () => {
    mockExistsSync.mockReturnValue(false);

    expect(buildInstallCommand('readyup')).toBe('npm install --save-dev readyup');
  });

  it('prefers pnpm when both lockfiles are present', () => {
    mockExistsSync.mockReturnValue(true);

    expect(buildInstallCommand('readyup')).toBe('pnpm add --save-dev readyup');
  });
});
