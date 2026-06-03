import process from 'node:process';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatReport } from '../../formatReport.ts';
import * as overlayModule from '../../overlay.ts';
import type { OverlayResult } from '../../types.ts';
import { run } from '../run.ts';

const stubResult: OverlayResult = {
  mode: 'create',
  entries: [{ path: '.newfile', outcome: 'created' }],
  scripts: { ran: 0, ok: true },
  counts: { created: 1, deleted: 0, forced: 0, conflicts: 0, pending: 0 },
  exitCode: 0,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe(run, () => {
  it('writes JSON to stdout and returns the result exit code under --json', async () => {
    vi.spyOn(overlayModule, 'overlay').mockResolvedValue(stubResult);
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    const code = await run(['/src', '--create', '--json']);

    expect(stdout).toHaveBeenCalledWith(`${JSON.stringify(stubResult)}\n`);
    expect(code).toBe(0);
  });

  it('writes the text report to stdout when --json is absent', async () => {
    vi.spyOn(overlayModule, 'overlay').mockResolvedValue(stubResult);
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    await run(['/src', '--create']);

    expect(stdout).toHaveBeenCalledWith(`${formatReport(stubResult)}\n`);
  });

  it('propagates the result exit code', async () => {
    vi.spyOn(overlayModule, 'overlay').mockResolvedValue({ ...stubResult, exitCode: 1 });
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    expect(await run(['/src', '--create'])).toBe(1);
  });

  it('writes a JSON error to stderr and returns exit 2 when overlay throws', async () => {
    vi.spyOn(overlayModule, 'overlay').mockRejectedValue(new Error('chezmoi not found on PATH'));
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const code = await run(['/src', '--create']);

    expect(stderr).toHaveBeenCalledWith(`${JSON.stringify({ error: 'chezmoi not found on PATH' })}\n`);
    expect(code).toBe(2);
  });

  it('returns exit 2 and writes a JSON error when argument parsing fails', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const code = await run(['--unknown-flag']);

    expect(code).toBe(2);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('"error"'));
  });

  it('writes help to stdout and returns 0 for --help', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    const code = await run(['--help']);

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
    expect(code).toBe(0);
  });
});
