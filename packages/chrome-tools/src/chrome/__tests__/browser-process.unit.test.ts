import { describe, expect, it } from 'vitest';

import { findBrowserPid, readIsHeadless, resolveProfileState } from '../browser-process.ts';
import { type FakeThorChrome, makeFakeThorChrome } from '../test-utils/fake-thor-chrome.ts';

describe(findBrowserPid, () => {
  it('ignores a helper process, which has --type=, and finds the browser beside it', () => {
    const fake = makeFakeWithProcesses((profilesDir) => ({
      '11': `chrome --type=renderer --user-data-dir=${profilesDir}/thrive`,
      '12': `chrome --remote-debugging-port=9321 --user-data-dir=${profilesDir}/thrive`,
    }));
    expect(findBrowserPid(fake.makeInvocation(), `${fake.profilesDir}/thrive`)).toStrictEqual({
      isReadable: true,
      pid: '12',
    });
  });

  it('finds no browser when only a helper process matches', () => {
    const fake = makeFakeWithProcesses((profilesDir) => ({
      '11': `chrome --type=renderer --user-data-dir=${profilesDir}/thrive`,
    }));
    expect(findBrowserPid(fake.makeInvocation(), `${fake.profilesDir}/thrive`)).toStrictEqual({
      isReadable: true,
      pid: undefined,
    });
  });

  it('does not mistake a profile whose name extends the searched one for that profile', () => {
    const fake = makeFakeWithProcesses((profilesDir) => ({
      '21': `chrome --user-data-dir=${profilesDir}/thrive-2`,
    }));
    const invocation = fake.makeInvocation();
    expect(findBrowserPid(invocation, `${fake.profilesDir}/thrive`)).toStrictEqual({
      isReadable: true,
      pid: undefined,
    });
    expect(findBrowserPid(invocation, `${fake.profilesDir}/thrive-2`)).toStrictEqual({ isReadable: true, pid: '21' });
  });
});

describe(readIsHeadless, () => {
  it.each([
    ['chrome --headless --user-data-dir=/p', true],
    ['chrome --user-data-dir=/p --headless=new', true],
    ['chrome --headless', true],
    ['chrome --headless-mode-flag --user-data-dir=/p', false],
    ['chrome --user-data-dir=/p', false],
  ])('reads %s as headless: %s', (command, isHeadless) => {
    const fake = makeFakeThorChrome({ results: { 'ps -o command= -p 7': { stdout: `${command}\n` } } });
    expect(readIsHeadless(fake.makeInvocation(), '7')).toBe(isHeadless);
  });
});

describe(resolveProfileState, () => {
  it('reads the mode of a running browser and leaves it unset when none is found', () => {
    const fake = makeFakeWithProcesses((profilesDir) => ({
      '31': `chrome --remote-debugging-port=9321 --headless --user-data-dir=${profilesDir}/thrive`,
      '32': `chrome --user-data-dir=${profilesDir}/atlas`,
    }));
    const invocation = fake.makeInvocation();
    expect(resolveProfileState(invocation, `${fake.profilesDir}/thrive`)).toStrictEqual({
      isHeadless: true,
      pid: '31',
      port: '9321',
      state: 'debugging',
    });
    expect(resolveProfileState(invocation, `${fake.profilesDir}/atlas`)).toMatchObject({
      isHeadless: false,
      state: 'running-without-port',
    });
    expect(resolveProfileState(invocation, `${fake.profilesDir}/gone`)).toMatchObject({
      isHeadless: undefined,
      state: 'stopped',
    });
  });
});

// region | Helpers

/**
 * Builds a fake whose `pgrep -f` matches its pattern against a process table, as the real one does, and whose `ps`
 * prints each process's command line.
 */
function makeFakeWithProcesses(buildTable: (profilesDir: string) => Record<string, string>): FakeThorChrome {
  let table: Record<string, string> = {};
  const fake = makeFakeThorChrome({
    run: (program, args) => {
      if (program === 'pgrep') {
        const pattern = new RegExp(args[1] ?? '');
        const pids = Object.keys(table).filter((pid) => pattern.test(table[pid] ?? ''));
        return { status: pids.length === 0 ? 1 : 0, stderr: '', stdout: pids.map((pid) => `${pid}\n`).join('') };
      }
      if (program === 'ps') {
        const command = table[args.at(-1) ?? ''];
        return command === undefined
          ? { status: 1, stderr: '', stdout: '' }
          : { status: 0, stderr: '', stdout: `${command}\n` };
      }
      return { status: 0, stderr: '', stdout: '' };
    },
  });
  table = buildTable(fake.profilesDir);
  return fake;
}

// endregion | Helpers
