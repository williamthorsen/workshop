import { afterEach, describe, expect, it, vi } from 'vitest';

import { readStatus } from '../readStatus.ts';
import type { ChezmoiContext } from '../runChezmoi.ts';
import * as runChezmoiModule from '../runChezmoi.ts';

const context: ChezmoiContext = { source: '/src', target: '/dst' };

afterEach(() => {
  vi.restoreAllMocks();
});

describe(readStatus, () => {
  it('returns stdout when chezmoi status exits 0', async () => {
    vi.spyOn(runChezmoiModule, 'runChezmoiCaptured').mockResolvedValue({ stdout: 'A  .newfile', stderr: '', code: 0 });

    expect(await readStatus(context)).toBe('A  .newfile');
  });

  it('throws with the stderr detail when chezmoi status exits non-zero', async () => {
    vi.spyOn(runChezmoiModule, 'runChezmoiCaptured').mockResolvedValue({
      stdout: '',
      stderr: 'source directory does not exist',
      code: 1,
    });

    await expect(readStatus(context)).rejects.toThrow(/chezmoi status failed: source directory does not exist/);
  });

  it('falls back to the exit code when stderr is empty', async () => {
    vi.spyOn(runChezmoiModule, 'runChezmoiCaptured').mockResolvedValue({ stdout: '', stderr: '', code: 1 });

    await expect(readStatus(context)).rejects.toThrow(/chezmoi status failed: exit code 1/);
  });
});
