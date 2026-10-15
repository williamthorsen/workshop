import { access } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import { runProcess } from '../../process/runProcess.ts';
import { resolveHomebrewBin } from '../resolveHomebrewBin.ts';

vi.mock('node:fs/promises', () => ({ access: vi.fn() }));
vi.mock('../../process/runProcess.ts', () => ({ runProcess: vi.fn() }));

describe(resolveHomebrewBin, () => {
  it('names the bin under the prefix that `brew --prefix` reports', async () => {
    vi.mocked(runProcess).mockResolvedValue({ exitCode: 0, output: '/usr/local\n', stdout: '/usr/local\n' });

    await expect(resolveHomebrewBin()).resolves.toBe('/usr/local/bin');
  });

  it('falls back to the default location that exists when `brew` exits nonzero', async () => {
    vi.mocked(runProcess).mockResolvedValue({ exitCode: 1, output: '', stdout: '' });
    mockExistingPaths(['/usr/local/bin']);

    await expect(resolveHomebrewBin()).resolves.toBe('/usr/local/bin');
  });

  it("prefers Apple silicon's location when `brew` cannot run and both defaults exist", async () => {
    vi.mocked(runProcess).mockRejectedValue(new Error('spawn brew ENOENT'));
    mockExistingPaths(['/opt/homebrew/bin', '/usr/local/bin']);

    await expect(resolveHomebrewBin()).resolves.toBe('/opt/homebrew/bin');
  });

  it('resolves to undefined when neither `brew` nor a default location is found', async () => {
    vi.mocked(runProcess).mockRejectedValue(new Error('spawn brew ENOENT'));
    mockExistingPaths([]);

    await expect(resolveHomebrewBin()).resolves.toBeUndefined();
  });
});

// region | Helpers

/** Makes `access` succeed for the given paths and reject for every other. */
function mockExistingPaths(existing: readonly string[]): void {
  vi.mocked(access).mockImplementation((candidate) =>
    existing.includes(String(candidate)) ? Promise.resolve() : Promise.reject(new Error('ENOENT')),
  );
}

// endregion | Helpers
