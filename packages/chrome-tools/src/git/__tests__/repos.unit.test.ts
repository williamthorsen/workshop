import { describe, expect, it } from 'vitest';

import { fakeRunCommand } from '../../test-utils/fake-run-command.ts';
import { readRepoDir, readRepoName } from '../repos.ts';

const COMMON_DIR_CALL = 'git rev-parse --path-format=absolute --git-common-dir';

describe(readRepoDir, () => {
  it('returns the parent of the common git directory', () => {
    const { calls, run } = fakeRunCommand({ [COMMON_DIR_CALL]: { stdout: '/repos/configs/macos/.git\n' } });
    expect(readRepoDir(run)).toBe('/repos/configs/macos');
    expect(calls).toStrictEqual([
      { args: ['rev-parse', '--path-format=absolute', '--git-common-dir'], program: 'git' },
    ]);
  });

  it('returns undefined outside a repository', () => {
    const { run } = fakeRunCommand({ [COMMON_DIR_CALL]: { status: 128 } });
    expect(readRepoDir(run)).toBeUndefined();
  });

  it('returns undefined when git prints nothing', () => {
    const { run } = fakeRunCommand({ [COMMON_DIR_CALL]: { stdout: '' } });
    expect(readRepoDir(run)).toBeUndefined();
  });
});

describe(readRepoName, () => {
  it("returns the main checkout's directory name", () => {
    const { run } = fakeRunCommand({ [COMMON_DIR_CALL]: { stdout: '/repos/configs/macos/.git\n' } });
    expect(readRepoName(run)).toBe('macos');
  });

  it('returns undefined outside a repository', () => {
    const { run } = fakeRunCommand({});
    expect(readRepoName(run)).toBeUndefined();
  });
});
