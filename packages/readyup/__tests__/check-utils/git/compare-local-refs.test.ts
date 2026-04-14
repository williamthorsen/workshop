import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { compareLocalRefs } from '../../../src/check-utils/git/compare-local-refs.ts';
import * as runGitModule from '../../../src/check-utils/git/run-git.ts';

function createTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rdy-cmp-'));
  execSync('git init', { cwd: dir, stdio: 'ignore' });
  execSync('git commit --allow-empty -m "init"', { cwd: dir, stdio: 'ignore' });
  return dir;
}

function commit(dir: string, message: string): void {
  writeFileSync(join(dir, `${Date.now()}.txt`), message);
  execSync('git add .', { cwd: dir, stdio: 'ignore' });
  execSync(`git commit -m "${message}"`, { cwd: dir, stdio: 'ignore' });
}

describe(compareLocalRefs, () => {
  it('returns match when both refs point to the same commit', async () => {
    const repo = createTempRepo();
    execSync('git branch test-branch', { cwd: repo, stdio: 'ignore' });

    const result = await compareLocalRefs(repo, 'HEAD', 'test-branch');

    expect(result.status).toBe('match');
    assert.ok(result.status === 'match');
    expect(result.shaA).toBe(result.shaB);
    expect(result.shaA).toMatch(/^[0-9a-f]{40}$/);
  });

  it('returns mismatch with ahead/behind when refs diverge', async () => {
    const repo = createTempRepo();
    execSync('git branch feature', { cwd: repo, stdio: 'ignore' });
    commit(repo, 'main-only');

    const result = await compareLocalRefs(repo, 'HEAD', 'feature');

    expect(result.status).toBe('mismatch');
    assert.ok(result.status === 'mismatch');
    expect(result.shaA).not.toBe(result.shaB);
    expect(result.aheadBehind).toEqual({ ahead: 1, behind: 0 });
  });

  it('returns mismatch with behind count when the first ref is behind', async () => {
    const repo = createTempRepo();
    execSync('git branch feature', { cwd: repo, stdio: 'ignore' });
    commit(repo, 'main-advance');

    // feature is behind HEAD by 1 commit
    const result = await compareLocalRefs(repo, 'feature', 'HEAD');

    expect(result.status).toBe('mismatch');
    assert.ok(result.status === 'mismatch');
    expect(result.aheadBehind).toEqual({ ahead: 0, behind: 1 });
  });

  it('returns ref-missing when the first ref does not exist', async () => {
    const repo = createTempRepo();

    const result = await compareLocalRefs(repo, 'nonexistent', 'HEAD');

    expect(result).toEqual({ status: 'ref-missing', ref: 'nonexistent' });
  });

  it('returns ref-missing when the second ref does not exist', async () => {
    const repo = createTempRepo();

    const result = await compareLocalRefs(repo, 'HEAD', 'nonexistent');

    expect(result).toEqual({ status: 'ref-missing', ref: 'nonexistent' });
  });

  it('rethrows non-ref-missing git errors instead of returning ref-missing', async () => {
    const gitError = Object.assign(new Error('git failed'), { code: 1, stderr: 'permission denied' });
    const spy = vi.spyOn(runGitModule, 'runGit').mockRejectedValue(gitError);

    await expect(compareLocalRefs('/tmp', 'a', 'b')).rejects.toThrow('git failed');

    spy.mockRestore();
  });
});
