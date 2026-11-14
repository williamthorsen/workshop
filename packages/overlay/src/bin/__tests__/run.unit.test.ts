import process from 'node:process';

import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OverlayError } from '../../errors/OverlayError.ts';
import * as overlayModule from '../../overlay.ts';
import { formatReport } from '../../reporting/formatReport.ts';
import { buildOverlayResult } from '../../test-utils/overlay-result.ts';
import { run } from '../run.ts';

const effects = { resolveVersion: () => '9.9.9' };

describe(run, () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['verify', 'create', 'force'] as const)('runs overlay in %s mode for that subcommand', async (mode) => {
    const overlay = vi.spyOn(overlayModule, 'overlay').mockResolvedValue(buildOverlayResult());
    using _io = captureStdio();

    await run([mode, '/src'], effects);

    expect(overlay).toHaveBeenCalledWith(expect.objectContaining({ source: '/src', mode }));
  });

  it('passes the target directory when one is given', async () => {
    const overlay = vi.spyOn(overlayModule, 'overlay').mockResolvedValue(buildOverlayResult());
    using _io = captureStdio();

    await run(['create', '/src', '/dest'], effects);

    expect(overlay).toHaveBeenCalledWith(expect.objectContaining({ target: '/dest' }));
  });

  it('writes JSON to stdout and returns the result exit code under --json', async () => {
    const result = buildOverlayResult();
    vi.spyOn(overlayModule, 'overlay').mockResolvedValue(result);
    using io = captureStdio();

    const code = await run(['create', '/src', '--json'], effects);

    expect(io.stdout).toBe(`${JSON.stringify(result)}\n`);
    expect(code).toBe(0);
  });

  it("sends chezmoi's streamed output to the process's stderr", async () => {
    const overlay = vi.spyOn(overlayModule, 'overlay').mockResolvedValue(buildOverlayResult());
    using _io = captureStdio();

    await run(['create', '/src'], effects);

    expect(overlay).toHaveBeenCalledWith(expect.objectContaining({ output: process.stderr }));
  });

  it('writes the text report to stdout when --json is absent', async () => {
    const result = buildOverlayResult();
    vi.spyOn(overlayModule, 'overlay').mockResolvedValue(result);
    using io = captureStdio();

    await run(['create', '/src'], effects);

    expect(io.stdout).toBe(`${formatReport(result)}\n`);
  });

  it('propagates the result exit code', async () => {
    vi.spyOn(overlayModule, 'overlay').mockResolvedValue(buildOverlayResult({ exitCode: 1 }));
    using _io = captureStdio();

    await expect(run(['create', '/src'], effects)).resolves.toBe(1);
  });

  it('writes the prefixed error without a help pointer and returns exit 2 when overlay throws', async () => {
    vi.spyOn(overlayModule, 'overlay').mockRejectedValue(new OverlayError('chezmoi not found on PATH'));
    using io = captureStdio();

    const code = await run(['create', '/src'], effects);

    expect(io.stderr).toBe('overlay: chezmoi not found on PATH\n');
    expect(code).toBe(2);
  });

  it('writes the same prefixed error to stderr and nothing to stdout under --json', async () => {
    vi.spyOn(overlayModule, 'overlay').mockRejectedValue(new OverlayError('chezmoi not found on PATH'));
    using io = captureStdio();

    const code = await run(['create', '/src', '--json'], effects);

    expect(io.stderr).toBe('overlay: chezmoi not found on PATH\n');
    expect(io.stdout).toBe('');
    expect(code).toBe(2);
  });

  it('lets an error other than an OverlayError propagate', async () => {
    const bug = new TypeError("Cannot read properties of undefined (reading 'path')");
    vi.spyOn(overlayModule, 'overlay').mockRejectedValue(bug);
    using io = captureStdio();

    await expect(run(['create', '/src'], effects)).rejects.toBe(bug);
    expect(io.stderr).toBe('');
  });

  it.each([
    ['an unknown subcommand', ['verfy', '/src'], /^overlay: Unknown command: verfy\nDid you mean 'verify'\?\n/],
    ['a bare source directory', ['./src'], /^overlay: Unknown command: \.\/src\n/],
    ['a missing subcommand', [], /^overlay: A command is required\.\n/],
    ['a former mode flag', ['--create', '/src'], /^overlay: Unknown option: --create\n/],
    ['a former mode flag after a subcommand', ['verify', '/src', '--force'], /^overlay: Unknown option: --force\n/],
    ['a missing source directory', ['verify'], /^overlay: Missing argument: <source-dir>\n/],
  ])('rejects %s as a usage error with exit 2', async (_label, argv, message) => {
    const overlay = vi.spyOn(overlayModule, 'overlay').mockResolvedValue(buildOverlayResult());
    using io = captureStdio();

    const code = await run(argv, effects);

    expect(code).toBe(2);
    expect(io.stderr).toMatch(message);
    expect(io.stderr).toMatch(/Try 'overlay( verify)? --help'\.\n$/);
    expect(overlay).not.toHaveBeenCalled();
  });

  it('lists the subcommands and exit codes in the top-level help', async () => {
    using io = captureStdio();

    const code = await run(['--help'], effects);

    expect(code).toBe(0);
    expect(io.stdout).toMatch(/verify[\s\S]*create[\s\S]*force/);
    expect(io.stdout).toContain('Exit codes:');
  });

  it.each([
    ['create', '--help'],
    ['create', '/src', '-h'],
  ])('prints the subcommand help for %s', async (...argv) => {
    using io = captureStdio();

    const code = await run(argv, effects);

    expect(code).toBe(0);
    expect(io.stdout).toContain('overlay create');
    expect(io.stdout).toContain('report differing files as conflicts');
  });

  it.each(['--version', '-V'])('prints the version for %s', async (flag) => {
    using io = captureStdio();

    const code = await run([flag], effects);

    expect(code).toBe(0);
    expect(io.stdout).toBe('9.9.9\n');
  });
});
