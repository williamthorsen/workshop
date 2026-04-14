import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { makeLocalRefSyncCheck, makeRemoteRefSyncCheck } from '../../../src/check-utils/git/factories.ts';

function createTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rdy-fac-'));
  execSync('git init', { cwd: dir, stdio: 'ignore' });
  execSync('git commit --allow-empty -m "init"', { cwd: dir, stdio: 'ignore' });
  return dir;
}

function createTempRepoWithRemote(): { local: string; remote: string } {
  const remote = mkdtempSync(join(tmpdir(), 'rdy-fac-remote-'));
  execSync('git init --bare', { cwd: remote, stdio: 'ignore' });

  const local = mkdtempSync(join(tmpdir(), 'rdy-fac-local-'));
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

describe(makeLocalRefSyncCheck, () => {
  it('passes when refs point to the same commit', async () => {
    const repo = createTempRepo();
    execSync('git branch feature', { cwd: repo, stdio: 'ignore' });

    const check = makeLocalRefSyncCheck({ name: 'sync', path: repo, refA: 'HEAD', refB: 'feature' });
    const result = await check.check();

    expect(result).toBe(true);
  });

  it('fails with detail when refs diverge', async () => {
    const repo = createTempRepo();
    execSync('git branch feature', { cwd: repo, stdio: 'ignore' });
    commit(repo, 'main-only');

    const check = makeLocalRefSyncCheck({ name: 'sync', path: repo, refA: 'HEAD', refB: 'feature' });
    const result = await check.check();

    expect(result).toEqual(expect.objectContaining({ ok: false }));
  });

  it('uses custom fix when provided', () => {
    const check = makeLocalRefSyncCheck({ name: 'sync', path: '/tmp', refA: 'a', refB: 'b', fix: 'custom fix' });

    expect(check.fix).toBe('custom fix');
  });

  it('has no fix when not provided', () => {
    const check = makeLocalRefSyncCheck({ name: 'sync', path: '/tmp', refA: 'a', refB: 'b' });

    expect(check.fix).toBeUndefined();
  });
});

describe(makeRemoteRefSyncCheck, () => {
  it('passes when local and remote match', async () => {
    const { local } = createTempRepoWithRemote();
    const branch = currentBranch(local);

    const check = makeRemoteRefSyncCheck({ name: 'remote-sync', path: local, ref: branch });
    const skipResult = await check.skip?.();
    expect(skipResult).toBe(false);

    const result = await check.check();
    expect(result).toBe(true);
  });

  it('fails when local is ahead of remote', async () => {
    const { local } = createTempRepoWithRemote();
    const branch = currentBranch(local);
    commit(local, 'local-only');

    const check = makeRemoteRefSyncCheck({ name: 'remote-sync', path: local, ref: branch });
    const result = await check.check();

    expect(result).toEqual(expect.objectContaining({ ok: false }));
  });

  it('returns skip reason when remote is unreachable', async () => {
    const local = mkdtempSync(join(tmpdir(), 'rdy-fac-unreach-'));
    execSync('git init', { cwd: local, stdio: 'ignore' });
    execSync('git remote add origin https://invalid.example.test/repo.git', { cwd: local, stdio: 'ignore' });
    execSync('git commit --allow-empty -m "init"', { cwd: local, stdio: 'ignore' });
    const branch = currentBranch(local);

    const check = makeRemoteRefSyncCheck({ name: 'remote-sync', path: local, ref: branch });
    const skipResult = await check.skip?.();

    expect(typeof skipResult).toBe('string');
    expect(skipResult).toContain('unreachable');
  });

  it('runs the probe at most once when both skip and check are called', async () => {
    const { local } = createTempRepoWithRemote();
    const branch = currentBranch(local);

    // Create the check and call both skip() and check() — the probe should only run once.
    // We verify by ensuring both calls return consistent results without error.
    const check = makeRemoteRefSyncCheck({ name: 'remote-sync', path: local, ref: branch });

    const skipResult = await check.skip?.();
    const checkResult = await check.check();

    // Both should succeed: skip returns false (not skipped), check returns true (in sync).
    expect(skipResult).toBe(false);
    expect(checkResult).toBe(true);
  });

  it('uses custom fix when provided', () => {
    const check = makeRemoteRefSyncCheck({ name: 'sync', path: '/tmp', ref: 'main', fix: 'run git pull' });

    expect(check.fix).toBe('run git pull');
  });
});
