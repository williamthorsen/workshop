import { describe, expect, it } from 'vitest';

import { fakeRunCommand } from '../fake-run-command.ts';

describe(fakeRunCommand, () => {
  it('answers a call with the result whose key is a prefix of its command line', () => {
    const { run } = fakeRunCommand({ 'git -C /wt config': { stdout: 'value\n' } });
    expect(run('git', ['-C', '/wt', 'config', '--get', 'key'])).toStrictEqual({
      status: 0,
      stderr: '',
      stdout: 'value\n',
    });
  });

  it('answers with the first matching key when several keys are prefixes of the call', () => {
    const { run } = fakeRunCommand({ 'git -C /wt': { stdout: 'first' }, 'git -C /wt config': { stdout: 'second' } });
    expect(run('git', ['-C', '/wt', 'config']).stdout).toBe('first');
  });

  it('fills the fields that a result omits with status 0 and empty output', () => {
    const { run } = fakeRunCommand({ wt: { stderr: 'warning' } });
    expect(run('wt', [])).toStrictEqual({ status: 0, stderr: 'warning', stdout: '' });
  });

  it('answers status 1 with empty output when no key matches', () => {
    const { run } = fakeRunCommand({ 'git status': {} });
    expect(run('git', ['log'])).toStrictEqual({ status: 1, stderr: '', stdout: '' });
  });

  it('records every call in order, matched or not', () => {
    const { calls, run } = fakeRunCommand({ wt: {} });
    run('wt', ['list']);
    run('git', ['status']);
    expect(calls).toStrictEqual([
      { args: ['list'], program: 'wt' },
      { args: ['status'], program: 'git' },
    ]);
  });

  it('records the options of a call that passes them', () => {
    const { calls, run } = fakeRunCommand({ git: {} });
    run('git', ['commit'], { stdio: 'inherit' });
    expect(calls).toStrictEqual([{ args: ['commit'], options: { stdio: 'inherit' }, program: 'git' }]);
  });
});
