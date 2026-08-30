import { homedir } from 'node:os';
import { promisify } from 'node:util';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { expandHome, isRefMissingError, runGit, runGitRaw, runGitWithInput } from '../run-git.ts';

const execFileAsync = vi.hoisted(() =>
  vi.fn<(file: string, args: string[]) => Promise<{ stdout: string; stderr: string }>>(),
);

const runWithInput = vi.hoisted(() =>
  vi.fn<(input: string, args: readonly string[]) => { error?: Error; stdout?: string }>(),
);

// `execFileAsync` answers the promisified form `runGit` and `runGitRaw` use; the stub answers the callback form
// `runGitWithInput` calls, which is the only one that hands back a child to write stdin to.
vi.mock('node:child_process', async () => {
  const { createExecFileStub } = await import('../../../test-utils/createExecFileStub.ts');
  const stub = createExecFileStub((input, args) => runWithInput(input, args));
  return { execFile: Object.assign(stub, { [promisify.custom]: execFileAsync }) };
});

describe(runGit, () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

describe(runGitRaw, () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns stdout unchanged, keeping the whitespace a trim would take', async () => {
    execFileAsync.mockResolvedValue({ stdout: ' leading-space.txt\0normal.txt\0', stderr: '' });

    const result = await runGitRaw('/repo', 'ls-files', '-z');

    expect(result).toBe(' leading-space.txt\0normal.txt\0');
    expect(execFileAsync).toHaveBeenCalledWith('git', ['-C', '/repo', 'ls-files', '-z']);
  });

  it('expands ~/ prefix to the home directory', async () => {
    execFileAsync.mockResolvedValue({ stdout: 'ok\n', stderr: '' });

    await runGitRaw('~/projects/repo', 'status');

    expect(execFileAsync).toHaveBeenCalledWith('git', ['-C', `${homedir()}/projects/repo`, 'status']);
  });
});

describe(runGitWithInput, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runWithInput.mockReturnValue({ stdout: '' });
  });

  it('writes the input to stdin and returns stdout unchanged', async () => {
    runWithInput.mockReturnValue({ stdout: 'a.txt\0set\0' });

    const result = await runGitWithInput('/repo', 'a.txt\0', 'check-attr', '-z', '--stdin', 'linguist-generated');

    expect(result).toBe('a.txt\0set\0');
    expect(runWithInput).toHaveBeenCalledWith('a.txt\0', [
      '-C',
      '/repo',
      'check-attr',
      '-z',
      '--stdin',
      'linguist-generated',
    ]);
  });

  it("rejects with git's own error, which a stdin write failing before it must not displace", async () => {
    runWithInput.mockReturnValue({ error: Object.assign(new Error('fatal: not a git repository'), { code: 128 }) });

    await expect(runGitWithInput('/repo', 'a.txt\0', 'check-attr', '--stdin')).rejects.toThrow('not a git repository');
  });

  it('expands ~/ prefix to the home directory', async () => {
    await runGitWithInput('~/projects/repo', '', 'check-attr', '--stdin');

    expect(runWithInput).toHaveBeenCalledWith('', ['-C', `${homedir()}/projects/repo`, 'check-attr', '--stdin']);
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

describe(expandHome, () => {
  it('expands bare ~ to the home directory', () => {
    expect(expandHome('~')).toBe(homedir());
  });

  it('expands bare ~/ to the home directory', () => {
    expect(expandHome('~/')).toBe(homedir());
  });

  it('expands ~/ prefix to the home directory', () => {
    expect(expandHome('~/projects/repo')).toBe(`${homedir()}/projects/repo`);
  });

  it('leaves paths without a leading tilde unchanged', () => {
    expect(expandHome('/absolute/path')).toBe('/absolute/path');
    expect(expandHome('relative/path')).toBe('relative/path');
  });

  it('does not expand ~ that is not a leading path segment', () => {
    expect(expandHome('/home/~user/repo')).toBe('/home/~user/repo');
    expect(expandHome('./~/repo')).toBe('./~/repo');
  });
});
