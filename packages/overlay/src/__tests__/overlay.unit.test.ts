import path from 'node:path';
import process from 'node:process';
import { PassThrough } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { chezmoiRunner } from '../chezmoi/run-chezmoi.ts';
import * as versionModule from '../chezmoi/version.ts';
import * as createModule from '../modes/create.ts';
import * as forceModule from '../modes/force.ts';
import * as verifyModule from '../modes/verify.ts';
import { overlay } from '../overlay.ts';
import { buildOverlayResult } from '../test-utils/overlay-result.ts';

describe(overlay, () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs the version preflight before dispatching', async () => {
    const preflight = vi.spyOn(versionModule, 'assertChezmoiVersion').mockResolvedValue();
    vi.spyOn(verifyModule, 'runVerify').mockResolvedValue(buildOverlayResult());

    await overlay({ source: '/src' });

    expect(preflight).toHaveBeenCalledTimes(1);
  });

  it('propagates a failed preflight as a thrown error', async () => {
    vi.spyOn(versionModule, 'assertChezmoiVersion').mockRejectedValue(new Error('chezmoi too old'));

    await expect(overlay({ source: '/src' })).rejects.toThrow(/chezmoi too old/);
  });

  it('defaults to verify mode and the current working directory as target', async () => {
    vi.spyOn(versionModule, 'assertChezmoiVersion').mockResolvedValue();
    const verify = vi.spyOn(verifyModule, 'runVerify').mockResolvedValue(buildOverlayResult());

    await overlay({ source: 'src' });

    expect(verify).toHaveBeenCalledWith({
      source: path.resolve('src'),
      target: process.cwd(),
      output: process.stderr,
      runner: chezmoiRunner,
    });
  });

  it('resolves the target to an absolute path', async () => {
    vi.spyOn(versionModule, 'assertChezmoiVersion').mockResolvedValue();
    const verify = vi.spyOn(verifyModule, 'runVerify').mockResolvedValue(buildOverlayResult());

    await overlay({ source: '/src', target: 'relative/target' });

    expect(verify).toHaveBeenCalledWith({
      source: '/src',
      target: path.resolve('relative/target'),
      output: process.stderr,
      runner: chezmoiRunner,
    });
  });

  it('passes the caller-supplied output stream to the mode', async () => {
    vi.spyOn(versionModule, 'assertChezmoiVersion').mockResolvedValue();
    const verify = vi.spyOn(verifyModule, 'runVerify').mockResolvedValue(buildOverlayResult());
    const output = new PassThrough();

    await overlay({ source: '/src', output });

    expect(verify).toHaveBeenCalledWith(expect.objectContaining({ output }));
  });

  it('dispatches to create mode', async () => {
    vi.spyOn(versionModule, 'assertChezmoiVersion').mockResolvedValue();
    const create = vi.spyOn(createModule, 'runCreate').mockResolvedValue(buildOverlayResult({ mode: 'create' }));

    await overlay({ source: '/src', mode: 'create' });

    expect(create).toHaveBeenCalledTimes(1);
  });

  it('dispatches to force mode', async () => {
    vi.spyOn(versionModule, 'assertChezmoiVersion').mockResolvedValue();
    const force = vi.spyOn(forceModule, 'runForce').mockResolvedValue(buildOverlayResult({ mode: 'force' }));

    await overlay({ source: '/src', mode: 'force' });

    expect(force).toHaveBeenCalledTimes(1);
  });
});
