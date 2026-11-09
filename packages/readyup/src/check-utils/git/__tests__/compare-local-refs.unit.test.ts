import assert from 'node:assert';

import { describe, expect, it } from 'vitest';

import { compareLocalRefsWith } from '../compare-local-refs.ts';
import { createFakeGit, makeRefMissingError } from '../test-utils/fake-git.ts';

describe(compareLocalRefsWith, () => {
  it('returns match when both refs resolve to the same SHA', async () => {
    const sha = 'abc123def456abc123def456abc123def456abc1';
    const git = createFakeGit({
      'rev-parse --verify refA': sha,
      'rev-parse --verify refB': sha,
      'rev-parse refA': sha,
      'rev-parse refB': sha,
    });

    const result = await compareLocalRefsWith(git, '/repo', 'refA', 'refB');

    expect(result.status).toBe('match');
    assert.ok(result.status === 'match');
    expect(result.shaA).toBe(sha);
    expect(result.shaB).toBe(sha);
  });

  it('returns mismatch with ahead count when refA is ahead', async () => {
    const git = createFakeGit({
      'rev-parse --verify refA': 'aaa',
      'rev-parse --verify refB': 'bbb',
      'rev-parse refA': 'aaa111',
      'rev-parse refB': 'bbb222',
      'rev-list --count --left-right': '3\t0',
    });

    const result = await compareLocalRefsWith(git, '/repo', 'refA', 'refB');

    expect(result.status).toBe('mismatch');
    assert.ok(result.status === 'mismatch');
    expect(result.shaA).toBe('aaa111');
    expect(result.shaB).toBe('bbb222');
    expect(result.aheadBehind).toStrictEqual({ ahead: 3, behind: 0 });
  });

  it('returns mismatch with behind count when refA is behind', async () => {
    const git = createFakeGit({
      'rev-parse --verify refA': 'aaa',
      'rev-parse --verify refB': 'bbb',
      'rev-parse refA': 'aaa111',
      'rev-parse refB': 'bbb222',
      'rev-list --count --left-right': '0\t2',
    });

    const result = await compareLocalRefsWith(git, '/repo', 'refA', 'refB');

    expect(result.status).toBe('mismatch');
    assert.ok(result.status === 'mismatch');
    expect(result.aheadBehind).toStrictEqual({ ahead: 0, behind: 2 });
  });

  it('returns mismatch with both counts when refs have diverged', async () => {
    const git = createFakeGit({
      'rev-parse --verify refA': 'aaa',
      'rev-parse --verify refB': 'bbb',
      'rev-parse refA': 'aaa111',
      'rev-parse refB': 'bbb222',
      'rev-list --count --left-right': '2\t3',
    });

    const result = await compareLocalRefsWith(git, '/repo', 'refA', 'refB');

    expect(result.status).toBe('mismatch');
    assert.ok(result.status === 'mismatch');
    expect(result.aheadBehind).toStrictEqual({ ahead: 2, behind: 3 });
  });

  it('returns ref-missing when refA does not exist', async () => {
    const git = createFakeGit({
      'rev-parse --verify refA': makeRefMissingError('refA'),
      'rev-parse --verify refB': 'exists',
    });

    const result = await compareLocalRefsWith(git, '/repo', 'refA', 'refB');

    expect(result).toStrictEqual({ status: 'ref-missing', ref: 'refA' });
  });

  it('returns ref-missing when refB does not exist', async () => {
    const git = createFakeGit({
      'rev-parse --verify refA': 'exists',
      'rev-parse --verify refB': makeRefMissingError('refB'),
    });

    const result = await compareLocalRefsWith(git, '/repo', 'refA', 'refB');

    expect(result).toStrictEqual({ status: 'ref-missing', ref: 'refB' });
  });

  it('rethrows non-ref-missing errors', async () => {
    const infraError = Object.assign(new Error('not a git repo'), {
      code: 128,
      stderr: 'fatal: not a git repository (or any of the parent directories): .git',
    });
    const git = createFakeGit({
      'rev-parse --verify refA': infraError,
    });

    await expect(compareLocalRefsWith(git, '/repo', 'refA', 'refB')).rejects.toThrow('not a git repo');
  });

  it('omits aheadBehind when rev-list output is malformed', async () => {
    const git = createFakeGit({
      'rev-parse --verify refA': 'aaa',
      'rev-parse --verify refB': 'bbb',
      'rev-parse refA': 'aaa111',
      'rev-parse refB': 'bbb222',
      'rev-list --count --left-right': 'garbage',
    });

    const result = await compareLocalRefsWith(git, '/repo', 'refA', 'refB');

    expect(result.status).toBe('mismatch');
    assert.ok(result.status === 'mismatch');
    expect(result.aheadBehind).toBeUndefined();
  });

  it('omits aheadBehind when rev-list fails', async () => {
    const git = createFakeGit({
      'rev-parse --verify refA': 'aaa',
      'rev-parse --verify refB': 'bbb',
      'rev-parse refA': 'aaa111',
      'rev-parse refB': 'bbb222',
      'rev-list --count --left-right': new Error('rev-list failed'),
    });

    const result = await compareLocalRefsWith(git, '/repo', 'refA', 'refB');

    expect(result.status).toBe('mismatch');
    assert.ok(result.status === 'mismatch');
    expect(result.aheadBehind).toBeUndefined();
  });
});
