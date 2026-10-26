import { describe, expect, it } from 'vitest';

import { fakeRunCommand } from '../../test-utils/fake-run-command.ts';
import { readCurrentBranch } from '../branches.ts';

describe(readCurrentBranch, () => {
  it('returns the checked-out branch', () => {
    const { calls, run } = fakeRunCommand({ 'git branch --show-current': { stdout: 'feature\n' } });
    expect(readCurrentBranch(run)).toBe('feature');
    expect(calls).toStrictEqual([{ args: ['branch', '--show-current'], program: 'git' }]);
  });

  it('returns undefined on a detached HEAD, for which git prints nothing', () => {
    const { run } = fakeRunCommand({ 'git branch --show-current': { stdout: '' } });
    expect(readCurrentBranch(run)).toBeUndefined();
  });

  it('returns undefined when git fails', () => {
    const { run } = fakeRunCommand({});
    expect(readCurrentBranch(run)).toBeUndefined();
  });
});
