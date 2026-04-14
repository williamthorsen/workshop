import assert from 'node:assert';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { compareLocalRefs } from '../../../src/check-utils/git/compare-local-refs.ts';
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
  runGit.mockImplementation(async (_path: string, ...args: string[]) => {
    const key = args.join(' ');
    for (const [pattern, value] of Object.entries(routes)) {
      if (key.includes(pattern)) {
        if (value instanceof Error) throw value;
        return value;
      }
    }
    throw new Error(`Unexpected runGit call: git ${args.join(' ')}`);
  });
}

function makeRefMissingError(ref: string): Error {
  return Object.assign(new Error(`unknown revision: ${ref}`), {
    code: 128,
    stderr: `fatal: ambiguous argument '${ref}': unknown revision or path not in the working tree.`,
  });
}

describe(compareLocalRefs, () => {
  it('returns match when both refs resolve to the same SHA', async () => {
    const sha = 'abc123def456abc123def456abc123def456abc1';
    stubRunGit({
      'rev-parse --verify refA': sha,
      'rev-parse --verify refB': sha,
      'rev-parse refA': sha,
      'rev-parse refB': sha,
    });

    const result = await compareLocalRefs('/repo', 'refA', 'refB');

    expect(result.status).toBe('match');
    assert.ok(result.status === 'match');
    expect(result.shaA).toBe(sha);
    expect(result.shaB).toBe(sha);
  });

  it('returns mismatch with ahead count when refA is ahead', async () => {
    stubRunGit({
      'rev-parse --verify refA': 'aaa',
      'rev-parse --verify refB': 'bbb',
      'rev-parse refA': 'aaa111',
      'rev-parse refB': 'bbb222',
      'rev-list --count --left-right': '3\t0',
    });

    const result = await compareLocalRefs('/repo', 'refA', 'refB');

    expect(result.status).toBe('mismatch');
    assert.ok(result.status === 'mismatch');
    expect(result.shaA).toBe('aaa111');
    expect(result.shaB).toBe('bbb222');
    expect(result.aheadBehind).toEqual({ ahead: 3, behind: 0 });
  });

  it('returns mismatch with behind count when refA is behind', async () => {
    stubRunGit({
      'rev-parse --verify refA': 'aaa',
      'rev-parse --verify refB': 'bbb',
      'rev-parse refA': 'aaa111',
      'rev-parse refB': 'bbb222',
      'rev-list --count --left-right': '0\t2',
    });

    const result = await compareLocalRefs('/repo', 'refA', 'refB');

    expect(result.status).toBe('mismatch');
    assert.ok(result.status === 'mismatch');
    expect(result.aheadBehind).toEqual({ ahead: 0, behind: 2 });
  });

  it('returns mismatch with both counts when refs have diverged', async () => {
    stubRunGit({
      'rev-parse --verify refA': 'aaa',
      'rev-parse --verify refB': 'bbb',
      'rev-parse refA': 'aaa111',
      'rev-parse refB': 'bbb222',
      'rev-list --count --left-right': '2\t3',
    });

    const result = await compareLocalRefs('/repo', 'refA', 'refB');

    expect(result.status).toBe('mismatch');
    assert.ok(result.status === 'mismatch');
    expect(result.aheadBehind).toEqual({ ahead: 2, behind: 3 });
  });

  it('returns ref-missing when refA does not exist', async () => {
    stubRunGit({
      'rev-parse --verify refA': makeRefMissingError('refA'),
      'rev-parse --verify refB': 'exists',
    });

    const result = await compareLocalRefs('/repo', 'refA', 'refB');

    expect(result).toEqual({ status: 'ref-missing', ref: 'refA' });
  });

  it('returns ref-missing when refB does not exist', async () => {
    stubRunGit({
      'rev-parse --verify refA': 'exists',
      'rev-parse --verify refB': makeRefMissingError('refB'),
    });

    const result = await compareLocalRefs('/repo', 'refA', 'refB');

    expect(result).toEqual({ status: 'ref-missing', ref: 'refB' });
  });

  it('rethrows non-ref-missing errors', async () => {
    const infraError = Object.assign(new Error('not a git repo'), {
      code: 128,
      stderr: 'fatal: not a git repository (or any of the parent directories): .git',
    });
    stubRunGit({
      'rev-parse --verify refA': infraError,
    });

    await expect(compareLocalRefs('/repo', 'refA', 'refB')).rejects.toThrow('not a git repo');
  });

  it('omits aheadBehind when rev-list output is malformed', async () => {
    stubRunGit({
      'rev-parse --verify refA': 'aaa',
      'rev-parse --verify refB': 'bbb',
      'rev-parse refA': 'aaa111',
      'rev-parse refB': 'bbb222',
      'rev-list --count --left-right': 'garbage',
    });

    const result = await compareLocalRefs('/repo', 'refA', 'refB');

    expect(result.status).toBe('mismatch');
    assert.ok(result.status === 'mismatch');
    expect(result.aheadBehind).toBeUndefined();
  });

  it('omits aheadBehind when rev-list fails', async () => {
    stubRunGit({
      'rev-parse --verify refA': 'aaa',
      'rev-parse --verify refB': 'bbb',
      'rev-parse refA': 'aaa111',
      'rev-parse refB': 'bbb222',
      'rev-list --count --left-right': new Error('rev-list failed'),
    });

    const result = await compareLocalRefs('/repo', 'refA', 'refB');

    expect(result.status).toBe('mismatch');
    assert.ok(result.status === 'mismatch');
    expect(result.aheadBehind).toBeUndefined();
  });
});
