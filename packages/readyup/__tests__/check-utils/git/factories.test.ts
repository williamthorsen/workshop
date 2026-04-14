import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { makeLocalRefSyncCheck, makeRemoteRefSyncCheck } from '../../../src/check-utils/git/factories.ts';
import * as compareRefToRemoteModule from '../../../src/check-utils/git/compare-ref-to-remote.ts';

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

  it('reports ahead detail when refA is ahead of refB', async () => {
    const repo = createTempRepo();
    execSync('git branch feature', { cwd: repo, stdio: 'ignore' });
    commit(repo, 'main-only');

    const check = makeLocalRefSyncCheck({ name: 'sync', path: repo, refA: 'HEAD', refB: 'feature' });
    const result = await check.check();

    expect(result).toEqual(expect.objectContaining({ ok: false, detail: expect.stringContaining('ahead') }));
  });

  it('reports behind detail when refA is behind refB', async () => {
    const repo = createTempRepo();
    execSync('git branch feature', { cwd: repo, stdio: 'ignore' });
    commit(repo, 'main-advance');

    const check = makeLocalRefSyncCheck({ name: 'sync', path: repo, refA: 'feature', refB: 'HEAD' });
    const result = await check.check();

    expect(result).toEqual(expect.objectContaining({ ok: false, detail: expect.stringContaining('behind') }));
  });

  it('fails with ref-missing detail for a nonexistent ref', async () => {
    const repo = createTempRepo();

    const check = makeLocalRefSyncCheck({ name: 'sync', path: repo, refA: 'nonexistent', refB: 'HEAD' });
    const result = await check.check();

    expect(result).toEqual(expect.objectContaining({ ok: false }));
    expect(result).toEqual(expect.objectContaining({ detail: expect.stringContaining('nonexistent') }));
  });

  it('reports diverged detail when both refs have independent commits', async () => {
    const repo = createTempRepo();
    execSync('git branch feature', { cwd: repo, stdio: 'ignore' });
    commit(repo, 'main-advance');
    execSync('git checkout feature', { cwd: repo, stdio: 'ignore' });
    commit(repo, 'feature-advance');
    execSync('git checkout -', { cwd: repo, stdio: 'ignore' });

    const branch = currentBranch(repo);
    const check = makeLocalRefSyncCheck({ name: 'sync', path: repo, refA: branch, refB: 'feature' });
    const result = await check.check();

    expect(result).toEqual(expect.objectContaining({ ok: false }));
    expect(result).toEqual(expect.objectContaining({ detail: expect.stringContaining('diverged') }));
  });

  it('uses custom fix when provided', () => {
    const check = makeLocalRefSyncCheck({ name: 'sync', path: '/tmp', refA: 'a', refB: 'b', fix: 'custom fix' });

    expect(check.fix).toBe('custom fix');
  });

  it('has no fix when not provided', () => {
    const check = makeLocalRefSyncCheck({ name: 'sync', path: '/tmp', refA: 'a', refB: 'b' });

    expect(check.fix).toBeUndefined();
  });

  it('forwards severity to the check', () => {
    const check = makeLocalRefSyncCheck({ name: 'sync', path: '/tmp', refA: 'a', refB: 'b', severity: 'warn' });

    expect(check.severity).toBe('warn');
  });

  it('omits severity when not provided', () => {
    const check = makeLocalRefSyncCheck({ name: 'sync', path: '/tmp', refA: 'a', refB: 'b' });

    expect(check.severity).toBeUndefined();
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

  it('reports ahead detail when local is ahead of remote', async () => {
    const { local } = createTempRepoWithRemote();
    const branch = currentBranch(local);
    commit(local, 'local-only');

    const check = makeRemoteRefSyncCheck({ name: 'remote-sync', path: local, ref: branch });
    const result = await check.check();

    expect(result).toEqual(expect.objectContaining({ ok: false, detail: expect.stringContaining('ahead') }));
  });

  it('fails with ref-missing detail when local branch has no upstream', async () => {
    const { local } = createTempRepoWithRemote();
    execSync('git checkout -b only-local', { cwd: local, stdio: 'ignore' });
    execSync('git commit --allow-empty -m "local"', { cwd: local, stdio: 'ignore' });

    const check = makeRemoteRefSyncCheck({ name: 'remote-sync', path: local, ref: 'only-local' });
    const result = await check.check();

    expect(result).toEqual(expect.objectContaining({ ok: false }));
    expect(result).toEqual(expect.objectContaining({ detail: expect.stringContaining('only-local') }));
  });

  it('reports diverged detail when local and remote have independent commits', async () => {
    const { local, remote } = createTempRepoWithRemote();
    const branch = currentBranch(local);

    // Advance local.
    commit(local, 'local-advance');

    // Advance remote via a second clone so local and remote diverge.
    const clone2 = mkdtempSync(join(tmpdir(), 'rdy-fac-clone2-'));
    execSync(`git clone ${remote} ${clone2}`, { stdio: 'ignore' });
    commit(clone2, 'remote-advance');
    execSync('git push', { cwd: clone2, stdio: 'ignore' });

    // Fetch so the local tracking ref is up to date for rev-list.
    execSync('git fetch origin', { cwd: local, stdio: 'ignore' });

    const check = makeRemoteRefSyncCheck({ name: 'remote-sync', path: local, ref: branch });
    const result = await check.check();

    expect(result).toEqual(expect.objectContaining({ ok: false }));
    expect(result).toEqual(expect.objectContaining({ detail: expect.stringContaining('diverged') }));
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

  it('returns pass from check() when remote is unreachable', async () => {
    const local = mkdtempSync(join(tmpdir(), 'rdy-fac-unreach2-'));
    execSync('git init', { cwd: local, stdio: 'ignore' });
    execSync('git remote add origin https://invalid.example.test/repo.git', { cwd: local, stdio: 'ignore' });
    execSync('git commit --allow-empty -m "init"', { cwd: local, stdio: 'ignore' });
    const branch = currentBranch(local);

    const check = makeRemoteRefSyncCheck({ name: 'remote-sync', path: local, ref: branch });
    const result = await check.check();

    expect(result).toBe(true);
  });

  it('invokes the probe at most once when both skip and check are called', async () => {
    const { local } = createTempRepoWithRemote();
    const branch = currentBranch(local);

    const spy = vi.spyOn(compareRefToRemoteModule, 'compareRefToRemote');

    const check = makeRemoteRefSyncCheck({ name: 'remote-sync', path: local, ref: branch });
    await check.skip?.();
    await check.check();

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('uses custom fix when provided', () => {
    const check = makeRemoteRefSyncCheck({ name: 'sync', path: '/tmp', ref: 'main', fix: 'run git pull' });

    expect(check.fix).toBe('run git pull');
  });

  it('forwards severity to the check', () => {
    const check = makeRemoteRefSyncCheck({ name: 'sync', path: '/tmp', ref: 'main', severity: 'recommend' });

    expect(check.severity).toBe('recommend');
  });

  it('omits severity when not provided', () => {
    const check = makeRemoteRefSyncCheck({ name: 'sync', path: '/tmp', ref: 'main' });

    expect(check.severity).toBeUndefined();
  });
});
