import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compareRefToRemote } from '../../../src/check-utils/git/compare-ref-to-remote.ts';

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
    if (result.status === 'in-sync') {
      expect(result.localSha).toBe(result.remoteSha);
      expect(result.localSha).toMatch(/^[0-9a-f]{40}$/);
    }
  });

  it('returns out-of-sync when local is ahead of remote', async () => {
    const { local } = createTempRepoWithRemote();
    const branch = currentBranch(local);
    commit(local, 'local-only');

    const result = await compareRefToRemote(local, branch);

    expect(result.status).toBe('out-of-sync');
    if (result.status === 'out-of-sync') {
      expect(result.localSha).not.toBe(result.remoteSha);
    }
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

  it('returns unreachable when the remote cannot be contacted', async () => {
    const local = mkdtempSync(join(tmpdir(), 'rdy-unreachable-'));
    execSync('git init', { cwd: local, stdio: 'ignore' });
    execSync('git remote add origin https://invalid.example.test/repo.git', { cwd: local, stdio: 'ignore' });
    execSync('git commit --allow-empty -m "init"', { cwd: local, stdio: 'ignore' });
    const branch = currentBranch(local);

    const result = await compareRefToRemote(local, branch);

    expect(result.status).toBe('unreachable');
    if (result.status === 'unreachable') {
      expect(result.error).toBeInstanceOf(Error);
    }
  });
});
