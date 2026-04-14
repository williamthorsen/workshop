import assert from 'node:assert';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { compareRefToRemote } from '../../../src/check-utils/git/compare-ref-to-remote.ts';
import * as runGitModule from '../../../src/check-utils/git/run-git.ts';

vi.mock('../../../src/check-utils/git/run-git.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/check-utils/git/run-git.ts')>();
  return {
    ...original,
    runGit: vi.fn(),
  };
});

const runGit = vi.mocked(runGitModule.runGit);

beforeEach(() => {
  vi.restoreAllMocks();
});

/** Stub `runGit` to route calls by git subcommand and arguments. */
function stubRunGit(routes: Record<string, string | Error>): void {
  runGit.mockImplementation((_path: string, ...args: string[]) => {
    const key = args.join(' ');
    for (const [pattern, value] of Object.entries(routes)) {
      if (key.includes(pattern)) {
        if (value instanceof Error) return Promise.reject(value);
        return Promise.resolve(value);
      }
    }
    return Promise.reject(new Error(`Unexpected runGit call: git ${args.join(' ')}`));
  });
}

function makeRefMissingError(ref: string): Error {
  return Object.assign(new Error(`unknown revision: ${ref}`), {
    code: 128,
    stderr: `fatal: ambiguous argument '${ref}': unknown revision or path not in the working tree.`,
  });
}

const LOCAL_SHA = 'aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111';
const REMOTE_SHA = 'bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222';

describe(compareRefToRemote, () => {
  it('returns in-sync when local and remote SHAs match', async () => {
    stubRunGit({
      'rev-parse --verify main': LOCAL_SHA,
      'ls-remote origin main': `${LOCAL_SHA}\trefs/heads/main`,
    });

    const result = await compareRefToRemote('/repo', 'main');

    expect(result.status).toBe('in-sync');
    assert.ok(result.status === 'in-sync');
    expect(result.localSha).toBe(LOCAL_SHA);
    expect(result.remoteSha).toBe(LOCAL_SHA);
  });

  it('returns out-of-sync with ahead count when local is ahead', async () => {
    stubRunGit({
      'rev-parse --verify main': LOCAL_SHA,
      'ls-remote origin main': `${REMOTE_SHA}\trefs/heads/main`,
      'rev-list --count --left-right': '1\t0',
    });

    const result = await compareRefToRemote('/repo', 'main');

    expect(result.status).toBe('out-of-sync');
    assert.ok(result.status === 'out-of-sync');
    expect(result.localSha).toBe(LOCAL_SHA);
    expect(result.remoteSha).toBe(REMOTE_SHA);
    expect(result.aheadBehind).toEqual({ ahead: 1, behind: 0 });
  });

  it('returns out-of-sync with behind count when local is behind', async () => {
    stubRunGit({
      'rev-parse --verify main': LOCAL_SHA,
      'ls-remote origin main': `${REMOTE_SHA}\trefs/heads/main`,
      'rev-list --count --left-right': '0\t3',
    });

    const result = await compareRefToRemote('/repo', 'main');

    expect(result.status).toBe('out-of-sync');
    assert.ok(result.status === 'out-of-sync');
    expect(result.aheadBehind).toEqual({ ahead: 0, behind: 3 });
  });

  it('returns out-of-sync with both counts when diverged', async () => {
    stubRunGit({
      'rev-parse --verify main': LOCAL_SHA,
      'ls-remote origin main': `${REMOTE_SHA}\trefs/heads/main`,
      'rev-list --count --left-right': '2\t5',
    });

    const result = await compareRefToRemote('/repo', 'main');

    expect(result.status).toBe('out-of-sync');
    assert.ok(result.status === 'out-of-sync');
    expect(result.aheadBehind).toEqual({ ahead: 2, behind: 5 });
  });

  it('returns ref-missing when local ref does not exist', async () => {
    stubRunGit({
      'rev-parse --verify nonexistent': makeRefMissingError('nonexistent'),
    });

    const result = await compareRefToRemote('/repo', 'nonexistent');

    expect(result).toEqual({ status: 'ref-missing', ref: 'nonexistent' });
  });

  it('returns ref-missing when remote ref does not exist', async () => {
    stubRunGit({
      'rev-parse --verify main': LOCAL_SHA,
      'ls-remote origin main': '',
    });

    const result = await compareRefToRemote('/repo', 'main');

    expect(result).toEqual({ status: 'ref-missing', ref: 'origin/main' });
  });

  it('returns unreachable when ls-remote throws', async () => {
    const networkError = new Error('Could not resolve host');
    stubRunGit({
      'rev-parse --verify main': LOCAL_SHA,
      'ls-remote origin main': networkError,
    });

    const result = await compareRefToRemote('/repo', 'main');

    expect(result.status).toBe('unreachable');
    assert.ok(result.status === 'unreachable');
    expect(result.error).toBe(networkError);
  });

  it('rethrows non-ref-missing errors from ref resolution', async () => {
    const infraError = Object.assign(new Error('not a git repo'), {
      code: 128,
      stderr: 'fatal: not a git repository (or any of the parent directories): .git',
    });
    stubRunGit({
      'rev-parse --verify main': infraError,
    });

    await expect(compareRefToRemote('/repo', 'main')).rejects.toThrow('not a git repo');
  });

  it('uses custom remote name', async () => {
    stubRunGit({
      'rev-parse --verify main': LOCAL_SHA,
      'ls-remote upstream main': `${LOCAL_SHA}\trefs/heads/main`,
    });

    const result = await compareRefToRemote('/repo', 'main', 'upstream');

    expect(result.status).toBe('in-sync');
  });

  it('omits aheadBehind when rev-list output is malformed', async () => {
    stubRunGit({
      'rev-parse --verify main': LOCAL_SHA,
      'ls-remote origin main': `${REMOTE_SHA}\trefs/heads/main`,
      'rev-list --count --left-right': 'not-a-number',
    });

    const result = await compareRefToRemote('/repo', 'main');

    expect(result.status).toBe('out-of-sync');
    assert.ok(result.status === 'out-of-sync');
    expect(result.aheadBehind).toBeUndefined();
  });
});
