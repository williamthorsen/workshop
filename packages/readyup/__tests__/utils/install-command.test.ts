import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockExistsSync = vi.hoisted(() => vi.fn());
const mockReadFileSync = vi.hoisted(() => vi.fn());

vi.mock(import('node:fs'), () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}));

import { buildInstallCommand } from '../../src/utils/install-command.ts';

const PACKAGE_DIR = path.resolve('/repo/packages/readyup');
const REPO_ROOT = path.resolve('/repo');

describe(buildInstallCommand, () => {
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue(PACKAGE_DIR);
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue('{}');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockExistsSync.mockReset();
    mockReadFileSync.mockReset();
  });

  it.each([
    ['pnpm-lock.yaml', 'pnpm add --save-dev readyup'],
    ['yarn.lock', 'yarn add --dev readyup'],
    ['package-lock.json', 'npm install --save-dev readyup'],
  ])('reads the package manager from %s in the current directory', (lockfile, expected) => {
    presentFiles(path.join(PACKAGE_DIR, lockfile));

    expect(buildInstallCommand('readyup')).toBe(expected);
  });

  it('finds a workspace lockfile above the current directory', () => {
    presentFiles(path.join(REPO_ROOT, 'pnpm-lock.yaml'));

    expect(buildInstallCommand('readyup')).toBe('pnpm add --save-dev readyup');
  });

  it('reads the packageManager field from a package.json above the current directory', () => {
    presentFiles(path.join(REPO_ROOT, 'package.json'));
    mockReadFileSync.mockReturnValue(JSON.stringify({ packageManager: 'pnpm@11.15.0' }));

    expect(buildInstallCommand('readyup')).toBe('pnpm add --save-dev readyup');
  });

  it('prefers a declared packageManager over a lockfile in the same directory', () => {
    presentFiles(path.join(REPO_ROOT, 'package.json'), path.join(REPO_ROOT, 'package-lock.json'));
    mockReadFileSync.mockReturnValue(JSON.stringify({ packageManager: 'yarn@4.1.0' }));

    expect(buildInstallCommand('readyup')).toBe('yarn add --dev readyup');
  });

  it('prefers the nearest signal over one further up the tree', () => {
    presentFiles(path.join(PACKAGE_DIR, 'yarn.lock'), path.join(REPO_ROOT, 'pnpm-lock.yaml'));

    expect(buildInstallCommand('readyup')).toBe('yarn add --dev readyup');
  });

  it('falls back to npm when no directory names a package manager', () => {
    expect(buildInstallCommand('readyup')).toBe('npm install --save-dev readyup');
  });

  it('falls back to npm when the declared package manager is unrecognized', () => {
    presentFiles(path.join(REPO_ROOT, 'package.json'));
    mockReadFileSync.mockReturnValue(JSON.stringify({ packageManager: 'somepm@1.0.0' }));

    expect(buildInstallCommand('readyup')).toBe('npm install --save-dev readyup');
  });

  it('falls back to npm when a package.json cannot be parsed', () => {
    presentFiles(path.join(REPO_ROOT, 'package.json'));
    mockReadFileSync.mockReturnValue('{ not json');

    expect(buildInstallCommand('readyup')).toBe('npm install --save-dev readyup');
  });
});

/** Make `existsSync` answer true for exactly the given paths. */
function presentFiles(...paths: string[]): void {
  const present = new Set(paths);
  mockExistsSync.mockImplementation((target: string) => present.has(target));
}
