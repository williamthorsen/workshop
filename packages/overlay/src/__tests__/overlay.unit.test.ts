import path from 'node:path';
import process from 'node:process';

import { afterEach, describe, expect, it, vi } from 'vitest';

import * as versionModule from '../chezmoi/version.ts';
import * as createModule from '../modes/create.ts';
import * as forceModule from '../modes/force.ts';
import * as verifyModule from '../modes/verify.ts';
import { overlay } from '../overlay.ts';
import type { OverlayResult } from '../types.ts';

const stubResult: OverlayResult = {
  mode: 'verify',
  entries: [],
  scripts: { ran: 0, ok: true },
  counts: { created: 0, deleted: 0, forced: 0, conflicts: 0, pending: 0 },
  exitCode: 0,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe(overlay, () => {
  it('runs the version preflight before dispatching', async () => {
    const preflight = vi.spyOn(versionModule, 'assertChezmoiVersion').mockResolvedValue();
    vi.spyOn(verifyModule, 'runVerify').mockResolvedValue(stubResult);

    await overlay({ source: '/src' });

    expect(preflight).toHaveBeenCalledOnce();
  });

  it('propagates a failed preflight as a thrown error', async () => {
    vi.spyOn(versionModule, 'assertChezmoiVersion').mockRejectedValue(new Error('chezmoi too old'));

    await expect(overlay({ source: '/src' })).rejects.toThrow(/chezmoi too old/);
  });

  it('defaults to verify mode and the current working directory as target', async () => {
    vi.spyOn(versionModule, 'assertChezmoiVersion').mockResolvedValue();
    const verify = vi.spyOn(verifyModule, 'runVerify').mockResolvedValue(stubResult);

    await overlay({ source: 'src' });

    expect(verify).toHaveBeenCalledWith({ source: path.resolve('src'), target: process.cwd() });
  });

  it('resolves the target to an absolute path', async () => {
    vi.spyOn(versionModule, 'assertChezmoiVersion').mockResolvedValue();
    const verify = vi.spyOn(verifyModule, 'runVerify').mockResolvedValue(stubResult);

    await overlay({ source: '/src', target: 'relative/target' });

    expect(verify).toHaveBeenCalledWith({ source: '/src', target: path.resolve('relative/target') });
  });

  it('dispatches to create mode', async () => {
    vi.spyOn(versionModule, 'assertChezmoiVersion').mockResolvedValue();
    const create = vi.spyOn(createModule, 'runCreate').mockResolvedValue({ ...stubResult, mode: 'create' });

    await overlay({ source: '/src', mode: 'create' });

    expect(create).toHaveBeenCalledOnce();
  });

  it('dispatches to force mode', async () => {
    vi.spyOn(versionModule, 'assertChezmoiVersion').mockResolvedValue();
    const force = vi.spyOn(forceModule, 'runForce').mockResolvedValue({ ...stubResult, mode: 'force' });

    await overlay({ source: '/src', mode: 'force' });

    expect(force).toHaveBeenCalledOnce();
  });
});
