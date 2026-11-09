import assert from 'node:assert';

import { describe, expect, it } from 'vitest';

import { compareRefToRemoteWith } from '../compare-ref-to-remote.ts';
import { createFakeGit, makeRefMissingError } from '../test-utils/fake-git.ts';

const LOCAL_SHA = 'aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111';
const REMOTE_SHA = 'bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222';

describe(compareRefToRemoteWith, () => {
  it('returns in-sync when local and remote SHAs match', async () => {
    const git = createFakeGit({
      'rev-parse --verify main': LOCAL_SHA,
      'ls-remote origin main': `${LOCAL_SHA}\trefs/heads/main`,
    });

    const result = await compareRefToRemoteWith(git, '/repo', 'main');

    expect(result.status).toBe('in-sync');
    assert.ok(result.status === 'in-sync');
    expect(result.localSha).toBe(LOCAL_SHA);
    expect(result.remoteSha).toBe(LOCAL_SHA);
  });

  it('returns out-of-sync with ahead count when local is ahead', async () => {
    const git = createFakeGit({
      'rev-parse --verify main': LOCAL_SHA,
      'ls-remote origin main': `${REMOTE_SHA}\trefs/heads/main`,
      'rev-list --count --left-right': '1\t0',
    });

    const result = await compareRefToRemoteWith(git, '/repo', 'main');

    expect(result.status).toBe('out-of-sync');
    assert.ok(result.status === 'out-of-sync');
    expect(result.localSha).toBe(LOCAL_SHA);
    expect(result.remoteSha).toBe(REMOTE_SHA);
    expect(result.aheadBehind).toStrictEqual({ ahead: 1, behind: 0 });
  });

  it('returns out-of-sync with behind count when local is behind', async () => {
    const git = createFakeGit({
      'rev-parse --verify main': LOCAL_SHA,
      'ls-remote origin main': `${REMOTE_SHA}\trefs/heads/main`,
      'rev-list --count --left-right': '0\t3',
    });

    const result = await compareRefToRemoteWith(git, '/repo', 'main');

    expect(result.status).toBe('out-of-sync');
    assert.ok(result.status === 'out-of-sync');
    expect(result.aheadBehind).toStrictEqual({ ahead: 0, behind: 3 });
  });

  it('returns out-of-sync with both counts when diverged', async () => {
    const git = createFakeGit({
      'rev-parse --verify main': LOCAL_SHA,
      'ls-remote origin main': `${REMOTE_SHA}\trefs/heads/main`,
      'rev-list --count --left-right': '2\t5',
    });

    const result = await compareRefToRemoteWith(git, '/repo', 'main');

    expect(result.status).toBe('out-of-sync');
    assert.ok(result.status === 'out-of-sync');
    expect(result.aheadBehind).toStrictEqual({ ahead: 2, behind: 5 });
  });

  it('returns ref-missing when local ref does not exist', async () => {
    const git = createFakeGit({
      'rev-parse --verify nonexistent': makeRefMissingError('nonexistent'),
    });

    const result = await compareRefToRemoteWith(git, '/repo', 'nonexistent');

    expect(result).toStrictEqual({ status: 'ref-missing', ref: 'nonexistent' });
  });

  it('returns ref-missing when remote ref does not exist', async () => {
    const git = createFakeGit({
      'rev-parse --verify main': LOCAL_SHA,
      'ls-remote origin main': '',
    });

    const result = await compareRefToRemoteWith(git, '/repo', 'main');

    expect(result).toStrictEqual({ status: 'ref-missing', ref: 'origin/main' });
  });

  it('returns unreachable when ls-remote throws', async () => {
    const networkError = new Error('Could not resolve host');
    const git = createFakeGit({
      'rev-parse --verify main': LOCAL_SHA,
      'ls-remote origin main': networkError,
    });

    const result = await compareRefToRemoteWith(git, '/repo', 'main');

    expect(result.status).toBe('unreachable');
    assert.ok(result.status === 'unreachable');
    expect(result.error).toBe(networkError);
  });

  it('rethrows non-ref-missing errors from ref resolution', async () => {
    const infraError = Object.assign(new Error('not a git repo'), {
      code: 128,
      stderr: 'fatal: not a git repository (or any of the parent directories): .git',
    });
    const git = createFakeGit({
      'rev-parse --verify main': infraError,
    });

    await expect(compareRefToRemoteWith(git, '/repo', 'main')).rejects.toThrow('not a git repo');
  });

  it('uses custom remote name', async () => {
    const git = createFakeGit({
      'rev-parse --verify main': LOCAL_SHA,
      'ls-remote upstream main': `${LOCAL_SHA}\trefs/heads/main`,
    });

    const result = await compareRefToRemoteWith(git, '/repo', 'main', 'upstream');

    expect(result.status).toBe('in-sync');
  });

  it('omits aheadBehind when rev-list output is malformed', async () => {
    const git = createFakeGit({
      'rev-parse --verify main': LOCAL_SHA,
      'ls-remote origin main': `${REMOTE_SHA}\trefs/heads/main`,
      'rev-list --count --left-right': 'not-a-number',
    });

    const result = await compareRefToRemoteWith(git, '/repo', 'main');

    expect(result.status).toBe('out-of-sync');
    assert.ok(result.status === 'out-of-sync');
    expect(result.aheadBehind).toBeUndefined();
  });
});
