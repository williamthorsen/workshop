import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OverlayResult } from '../../modes/types.ts';
import * as overlayModule from '../../overlay.ts';
import { formatReport } from '../../reporting/formatReport.ts';
import { run } from '../run.ts';

const stubResult: OverlayResult = {
  mode: 'create',
  entries: [{ path: '.newfile', outcome: 'created' }],
  scripts: { ran: 0, ok: true },
  counts: { created: 1, deleted: 0, forced: 0, conflicts: 0, pending: 0 },
  exitCode: 0,
};

describe(run, () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes JSON to stdout and returns the result exit code under --json', async () => {
    vi.spyOn(overlayModule, 'overlay').mockResolvedValue(stubResult);
    using io = captureStdio();

    const code = await run(['/src', '--create', '--json']);

    expect(io.stdout).toBe(`${JSON.stringify(stubResult)}\n`);
    expect(code).toBe(0);
  });

  it('writes the text report to stdout when --json is absent', async () => {
    vi.spyOn(overlayModule, 'overlay').mockResolvedValue(stubResult);
    using io = captureStdio();

    await run(['/src', '--create']);

    expect(io.stdout).toBe(`${formatReport(stubResult)}\n`);
  });

  it('propagates the result exit code', async () => {
    vi.spyOn(overlayModule, 'overlay').mockResolvedValue({ ...stubResult, exitCode: 1 });
    using _io = captureStdio();

    await expect(run(['/src', '--create'])).resolves.toBe(1);
  });

  it('writes a JSON error to stderr and returns exit 2 when overlay throws', async () => {
    vi.spyOn(overlayModule, 'overlay').mockRejectedValue(new Error('chezmoi not found on PATH'));
    using io = captureStdio();

    const code = await run(['/src', '--create']);

    expect(io.stderr).toBe(`${JSON.stringify({ error: 'chezmoi not found on PATH' })}\n`);
    expect(code).toBe(2);
  });

  it('returns exit 2 and writes a JSON error when argument parsing fails', async () => {
    using io = captureStdio();

    const code = await run(['--unknown-flag']);

    expect(code).toBe(2);
    expect(io.stderr).toContain('"error"');
  });

  it('writes help to stdout and returns 0 for --help', async () => {
    using io = captureStdio();

    const code = await run(['--help']);

    expect(io.stdout).toContain('Usage:');
    expect(code).toBe(0);
  });
});
