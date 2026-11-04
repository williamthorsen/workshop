import { describe, expect, it } from 'vitest';

import { describeGitFailure, type GitRun } from '../git-clone.ts';

const SUCCESS: GitRun = { signal: null, status: 0, stderr: '' };

describe(describeGitFailure, () => {
  it('returns undefined for a run that exits zero', () => {
    expect(describeGitFailure(['ls-files'], SUCCESS)).toBeUndefined();
  });

  it('describes an output overflow by its error, although the run also reports a signal', () => {
    const overflow = {
      ...SUCCESS,
      error: new Error('spawnSync git ENOBUFS'),
      signal: 'SIGTERM',
      status: null,
    } as const;
    expect(describeGitFailure(['ls-files', '-z'], overflow)).toBe('cannot run git ls-files: spawnSync git ENOBUFS');
  });

  it('describes a run that git did not start by its error', () => {
    const missing = { ...SUCCESS, error: new Error('spawnSync git ENOENT'), status: null };
    expect(describeGitFailure(['ls-files'], missing)).toBe('cannot run git ls-files: spawnSync git ENOENT');
  });

  it('names the signal that killed git', () => {
    expect(describeGitFailure(['ls-files'], { ...SUCCESS, signal: 'SIGKILL', status: null })).toBe(
      'git ls-files was killed by SIGKILL',
    );
  });

  it("reports the first line of git's stderr for a non-zero exit", () => {
    const stderr = 'fatal: not a git repository (or any of the parent directories): .git\nhint: second line\n';
    expect(describeGitFailure(['ls-files'], { ...SUCCESS, status: 128, stderr })).toBe(
      'fatal: not a git repository (or any of the parent directories): .git',
    );
  });

  it('reports the exit status when git exits non-zero without printing anything', () => {
    expect(describeGitFailure(['ls-files'], { ...SUCCESS, status: 1 })).toBe('git ls-files exited 1');
  });
});
