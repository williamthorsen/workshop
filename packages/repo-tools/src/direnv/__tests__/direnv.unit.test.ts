import { describe, expect, it } from 'vitest';

import { describeDirenvRun } from '../direnv.ts';

const SUCCESS = { signal: null, status: 0, stderr: '' };

describe(describeDirenvRun, () => {
  it.each([
    ['a missing binary', { error: Object.assign(new Error('spawn direnv ENOENT'), { code: 'ENOENT' }) }, 'absent'],
    ['another spawn error', { error: new Error('spawn direnv EACCES') }, 'cannot run direnv: spawn direnv EACCES'],
    ['a signal', { signal: 'SIGKILL' as const, status: null }, 'direnv was killed by SIGKILL'],
    [
      'a failure with stderr',
      { status: 1, stderr: 'direnv: loading\ndirenv: error .envrc is blocked\n' },
      'direnv: error .envrc is blocked',
    ],
    ['a failure without stderr', { status: 2 }, 'direnv exited 2'],
    ['success', {}, undefined],
  ])('describes %s', (_case, run, expected) => {
    expect(describeDirenvRun({ ...SUCCESS, ...run })).toBe(expected);
  });
});
