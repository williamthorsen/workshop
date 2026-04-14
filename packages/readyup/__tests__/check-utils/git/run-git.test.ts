import { homedir } from 'node:os';
import { promisify } from 'node:util';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isRefMissingError, runGit } from '../../../src/check-utils/git/run-git.ts';

const execFileAsync = vi.hoisted(() =>
  vi.fn<(file: string, args: string[]) => Promise<{ stdout: string; stderr: string }>>(),
);

vi.mock('node:child_process', () => {
  const stub = Object.assign(vi.fn(), { [promisify.custom]: execFileAsync });
  return { execFile: stub };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe(runGit, () => {
  it('returns trimmed stdout for a successful git command', async () => {
    execFileAsync.mockResolvedValue({ stdout: '  abc123\n', stderr: '' });

    const result = await runGit('/repo', 'rev-parse', 'HEAD');

    expect(result).toBe('abc123');
    expect(execFileAsync).toHaveBeenCalledWith('git', ['-C', '/repo', 'rev-parse', 'HEAD']);
  });

  it('throws when git exits with a nonzero code', async () => {
    execFileAsync.mockRejectedValue(Object.assign(new Error('git failed'), { code: 128 }));

    await expect(runGit('/repo', 'rev-parse', 'nonexistent')).rejects.toThrow('git failed');
  });

  it('expands bare ~ to the home directory', async () => {
    execFileAsync.mockResolvedValue({ stdout: 'ok\n', stderr: '' });

    await runGit('~', 'status');

    expect(execFileAsync).toHaveBeenCalledWith('git', ['-C', homedir(), 'status']);
  });

  it('expands ~/ prefix to the home directory', async () => {
    execFileAsync.mockResolvedValue({ stdout: 'ok\n', stderr: '' });

    await runGit('~/projects/repo', 'status');

    expect(execFileAsync).toHaveBeenCalledWith('git', ['-C', `${homedir()}/projects/repo`, 'status']);
  });

  it('expands bare ~/ to the home directory', async () => {
    execFileAsync.mockResolvedValue({ stdout: 'ok\n', stderr: '' });

    await runGit('~/', 'status');

    expect(execFileAsync).toHaveBeenCalledWith('git', ['-C', homedir(), 'status']);
  });

  it('does not expand ~ in the middle of a path', async () => {
    execFileAsync.mockResolvedValue({ stdout: 'ok\n', stderr: '' });

    await runGit('/home/~user/repo', 'status');

    expect(execFileAsync).toHaveBeenCalledWith('git', ['-C', '/home/~user/repo', 'status']);
  });
});

describe(isRefMissingError, () => {
  it('returns true for code 128 with "unknown revision" in stderr', () => {
    const error = Object.assign(new Error('git error'), {
      code: 128,
      stderr: "fatal: ambiguous argument 'nonexistent': unknown revision or path not in the working tree.",
    });

    expect(isRefMissingError(error)).toBe(true);
  });

  it('returns true for code 128 with "not a valid object name" in stderr', () => {
    const error = Object.assign(new Error('git error'), {
      code: 128,
      stderr: "fatal: Needed a single revision\nerror: not a valid object name: 'nonexistent'",
    });

    expect(isRefMissingError(error)).toBe(true);
  });

  it('returns false for code 128 with "not a git repository" in stderr', () => {
    const error = Object.assign(new Error('git error'), {
      code: 128,
      stderr: 'fatal: not a git repository (or any of the parent directories): .git',
    });

    expect(isRefMissingError(error)).toBe(false);
  });

  it('returns false for code 128 with "cannot change to" in stderr', () => {
    const error = Object.assign(new Error('git error'), {
      code: 128,
      stderr: "fatal: cannot change to '/nonexistent': No such file or directory",
    });

    expect(isRefMissingError(error)).toBe(false);
  });

  it('returns false for non-128 exit codes', () => {
    const error = Object.assign(new Error('git error'), { code: 1, stderr: 'unknown revision' });

    expect(isRefMissingError(error)).toBe(false);
  });

  it('returns false for non-object values', () => {
    expect(isRefMissingError('not an error')).toBe(false);
    expect(isRefMissingError(null)).toBe(false);
  });
});
