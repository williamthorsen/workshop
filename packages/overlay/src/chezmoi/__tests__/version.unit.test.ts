import { afterEach, describe, expect, it, vi } from 'vitest';

import * as runChezmoiModule from '../runChezmoi.ts';
import { assertChezmoiVersion, MIN_CHEZMOI_VERSION, parseVersion } from '../version.ts';

function mockVersionOutput(stdout: string, code = 0): void {
  vi.spyOn(runChezmoiModule, 'runChezmoiCaptured').mockResolvedValue({ stdout, stderr: '', code });
}

describe(parseVersion, () => {
  it('extracts the major.minor.patch triple from chezmoi version output', () => {
    expect(parseVersion('chezmoi version v2.70.4, commit abc, built at ...')).toStrictEqual({
      major: 2,
      minor: 70,
      patch: 4,
    });
  });

  it('returns undefined when no version triple is present', () => {
    expect(parseVersion('chezmoi version unknown')).toBeUndefined();
  });
});

describe(assertChezmoiVersion, () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves when the installed version equals the minimum', async () => {
    mockVersionOutput(`chezmoi version v${MIN_CHEZMOI_VERSION}`);

    await expect(assertChezmoiVersion()).resolves.toBeUndefined();
  });

  it('resolves when the installed version exceeds the minimum', async () => {
    mockVersionOutput('chezmoi version v2.70.4');

    await expect(assertChezmoiVersion()).resolves.toBeUndefined();
  });

  it('throws when the installed version is below the minimum', async () => {
    mockVersionOutput('chezmoi version v2.10.0');

    await expect(assertChezmoiVersion()).rejects.toThrow(/2\.46\.0 or later is required/);
  });

  it('throws when chezmoi exits non-zero', async () => {
    mockVersionOutput('', 1);

    await expect(assertChezmoiVersion()).rejects.toThrow(/not available/);
  });

  it('throws when the version cannot be parsed', async () => {
    mockVersionOutput('chezmoi version unknown');

    await expect(assertChezmoiVersion()).rejects.toThrow(/could not determine chezmoi version/);
  });
});
