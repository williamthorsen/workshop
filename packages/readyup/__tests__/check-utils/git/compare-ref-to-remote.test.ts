import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { compareRefToRemote } from '../../../src/check-utils/git/compare-ref-to-remote.ts';
import * as runGitModule from '../../../src/check-utils/git/run-git.ts';

function createTempRepoWithRemote(): { local: string; remote: string } {
  const remote = mkdtempSync(join(tmpdir(), 'rdy-remote-'));
  execSync('git init --bare', { cwd: remote, stdio: 'ignore' });

  const local = mkdtempSync(join(tmpdir(), 'rdy-local-'));
  execSync('git init', { cwd: local, stdio: 'ignore' });
  execSync(`git remote add origin ${remote}`, { cwd: local, stdio: 'ignore' });
  execSync('git commit --allow-empty -m "init"', { cwd: local, stdio: 'ignore' });
  execSync('git push -u origin HEAD', { cwd: local, stdio: 'ignore' });

  return { local, remote };
}

function commit(dir: string, message: string): void {
  writeFileSync(join(dir, `${Date.now()}.txt`), message);
  execSync('git add .', { cwd: dir, stdio: 'ignore' });
  execSync(`git commit -m "${message}"`, { cwd: dir, stdio: 'ignore' });
}

function currentBranch(dir: string): string {
  return execSync('git rev-parse --abbrev-ref HEAD', { cwd: dir }).toString().trim();
}

describe(compareRefToRemote, () => {
  it('returns in-sync when local and remote match', async () => {
    const { local } = createTempRepoWithRemote();
    const branch = currentBranch(local);

    const result = await compareRefToRemote(local, branch);

    expect(result.status).toBe('in-sync');
    assert.ok(result.status === 'in-sync');
    expect(result.localSha).toBe(result.remoteSha);
    expect(result.localSha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('returns out-of-sync when local is ahead of remote', async () => {
    const { local } = createTempRepoWithRemote();
    const branch = currentBranch(local);
    commit(local, 'local-only');

    const result = await compareRefToRemote(local, branch);

    expect(result.status).toBe('out-of-sync');
    assert.ok(result.status === 'out-of-sync');
    expect(result.localSha).not.toBe(result.remoteSha);
    expect(result.aheadBehind).toEqual({ ahead: 1, behind: 0 });
  });

  it('returns out-of-sync when local is behind remote', async () => {
    const { local, remote } = createTempRepoWithRemote();
    const branch = currentBranch(local);

    // Advance remote via a second clone without fetching locally.
    const clone2 = mkdtempSync(join(tmpdir(), 'rdy-clone2-'));
    execSync(`git clone ${remote} ${clone2}`, { stdio: 'ignore' });
    commit(clone2, 'remote-advance');
    execSync('git push', { cwd: clone2, stdio: 'ignore' });

    // Fetch so the local tracking ref sees the remote advance.
    execSync('git fetch origin', { cwd: local, stdio: 'ignore' });

    const result = await compareRefToRemote(local, branch);

    expect(result.status).toBe('out-of-sync');
    assert.ok(result.status === 'out-of-sync');
    expect(result.localSha).not.toBe(result.remoteSha);
    expect(result.aheadBehind).toEqual({ ahead: 0, behind: 1 });
  });

  it('returns ref-missing when local ref does not exist', async () => {
    const { local } = createTempRepoWithRemote();

    const result = await compareRefToRemote(local, 'nonexistent-branch');

    expect(result).toEqual({ status: 'ref-missing', ref: 'nonexistent-branch' });
  });

  it('returns ref-missing when remote ref does not exist', async () => {
    const { local } = createTempRepoWithRemote();
    execSync('git checkout -b only-local', { cwd: local, stdio: 'ignore' });
    execSync('git commit --allow-empty -m "local"', { cwd: local, stdio: 'ignore' });

    const result = await compareRefToRemote(local, 'only-local');

    expect(result).toEqual({ status: 'ref-missing', ref: 'origin/only-local' });
  });

  it('rethrows non-ref-missing git errors instead of returning ref-missing', async () => {
    const gitError = Object.assign(new Error('git failed'), { code: 1, stderr: 'permission denied' });
    const spy = vi.spyOn(runGitModule, 'runGit').mockRejectedValue(gitError);

    await expect(compareRefToRemote('/tmp', 'main')).rejects.toThrow('git failed');

    spy.mockRestore();
  });

  it('returns unreachable when the remote cannot be contacted', async () => {
    const local = mkdtempSync(join(tmpdir(), 'rdy-unreachable-'));
    execSync('git init', { cwd: local, stdio: 'ignore' });
    execSync('git remote add origin https://invalid.example.test/repo.git', { cwd: local, stdio: 'ignore' });
    execSync('git commit --allow-empty -m "init"', { cwd: local, stdio: 'ignore' });
    const branch = currentBranch(local);

    const result = await compareRefToRemote(local, branch);

    expect(result.status).toBe('unreachable');
    assert.ok(result.status === 'unreachable');
    expect(result.error).toBeInstanceOf(Error);
  });
});
