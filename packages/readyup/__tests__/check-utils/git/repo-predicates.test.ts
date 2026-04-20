import { homedir } from 'node:os';
import { promisify } from 'node:util';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const execFileAsync = vi.hoisted(() =>
  vi.fn<(file: string, args: string[]) => Promise<{ stdout: string; stderr: string }>>(),
);
const existsSyncMock = vi.hoisted(() => vi.fn<(path: string) => boolean>());

vi.mock('node:child_process', () => {
  const stub = Object.assign(vi.fn(), { [promisify.custom]: execFileAsync });
  return { execFile: stub };
});

vi.mock(import('node:fs'), () => ({
  existsSync: existsSyncMock,
}));

import { isAtRepoRoot, isGitRepo } from '../../../src/check-utils/git/repo-predicates.ts';

beforeEach(() => {
  vi.clearAllMocks();
  existsSyncMock.mockReturnValue(true);
});

describe(isGitRepo, () => {
  it('returns false when the path does not exist', async () => {
    existsSyncMock.mockReturnValue(false);

    expect(await isGitRepo('/missing')).toBe(false);
    expect(execFileAsync).not.toHaveBeenCalled();
  });

  it('returns true when `rev-parse --git-dir` succeeds at a repo root', async () => {
    execFileAsync.mockResolvedValue({ stdout: '.git\n', stderr: '' });

    expect(await isGitRepo('/repo')).toBe(true);
    expect(execFileAsync).toHaveBeenCalledWith('git', ['-C', '/repo', 'rev-parse', '--git-dir']);
  });

  it('returns true inside a subdirectory of a repo', async () => {
    execFileAsync.mockResolvedValue({ stdout: '/repo/.git\n', stderr: '' });

    expect(await isGitRepo('/repo/src/sub')).toBe(true);
  });

  it('returns true for a worktree root (git resolves worktrees natively)', async () => {
    execFileAsync.mockResolvedValue({ stdout: '/repo/.git/worktrees/feature\n', stderr: '' });

    expect(await isGitRepo('/repo.wt-feature')).toBe(true);
  });

  it('returns false when `rev-parse --git-dir` fails on a non-repo directory', async () => {
    execFileAsync.mockRejectedValue(Object.assign(new Error('fatal: not a git repository'), { code: 128 }));

    expect(await isGitRepo('/not-a-repo')).toBe(false);
  });

  it('expands `~/` in the path before checking existence and invoking git', async () => {
    execFileAsync.mockResolvedValue({ stdout: '.git\n', stderr: '' });

    await isGitRepo('~/projects/repo');

    const expanded = `${homedir()}/projects/repo`;
    expect(existsSyncMock).toHaveBeenCalledWith(expanded);
    expect(execFileAsync).toHaveBeenCalledWith('git', ['-C', expanded, 'rev-parse', '--git-dir']);
  });
});

describe(isAtRepoRoot, () => {
  it('returns false when the path does not exist', async () => {
    existsSyncMock.mockReturnValue(false);

    expect(await isAtRepoRoot('/missing')).toBe(false);
    expect(execFileAsync).not.toHaveBeenCalled();
  });

  it('returns true when `rev-parse --show-cdup` returns empty string', async () => {
    execFileAsync.mockResolvedValue({ stdout: '\n', stderr: '' });

    expect(await isAtRepoRoot('/repo')).toBe(true);
    expect(execFileAsync).toHaveBeenCalledWith('git', ['-C', '/repo', 'rev-parse', '--show-cdup']);
  });

  it('returns true for a worktree root', async () => {
    execFileAsync.mockResolvedValue({ stdout: '\n', stderr: '' });

    expect(await isAtRepoRoot('/repo.wt-feature')).toBe(true);
  });

  it('returns false inside a subdirectory of a repo (cdup is non-empty)', async () => {
    execFileAsync.mockResolvedValue({ stdout: '../\n', stderr: '' });

    expect(await isAtRepoRoot('/repo/sub')).toBe(false);
  });

  it('returns false on a non-repo directory', async () => {
    execFileAsync.mockRejectedValue(Object.assign(new Error('fatal: not a git repository'), { code: 128 }));

    expect(await isAtRepoRoot('/not-a-repo')).toBe(false);
  });

  it('expands `~/` in the path before checking existence and invoking git', async () => {
    execFileAsync.mockResolvedValue({ stdout: '\n', stderr: '' });

    await isAtRepoRoot('~/projects/repo');

    const expanded = `${homedir()}/projects/repo`;
    expect(existsSyncMock).toHaveBeenCalledWith(expanded);
    expect(execFileAsync).toHaveBeenCalledWith('git', ['-C', expanded, 'rev-parse', '--show-cdup']);
  });
});
