import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { findOnPath } from '../../../shared/paths.ts';
import { FIRST_RUNNING_PID, makeFakeThorChrome, makeRunningFakeThorChrome } from '../fake-thor-chrome.ts';

describe(makeFakeThorChrome, () => {
  it('answers as a working repository on branch 321 with every tool reporting a free, stopped profile', () => {
    const fake = makeFakeThorChrome();
    expect(fake.deps.run('git', ['branch', '--show-current']).stdout).toBe('321\n');
    expect(fake.deps.run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir']).stdout).toBe(
      `${fake.workRepoDir}/.git\n`,
    );
    expect(fake.deps.run('pgrep', ['-f', 'x']).status).toBe(1);
    expect(fake.deps.run('launchctl', ['managername']).stdout).toBe('Aqua\n');
  });

  it('tries an override ahead of the default that its key extends', () => {
    const fake = makeFakeThorChrome({ results: { 'pgrep -f user-data-dir=/a': { stdout: '4242\n' } } });
    expect(fake.deps.run('pgrep', ['-f', 'user-data-dir=/a( |$)']).stdout).toBe('4242\n');
    expect(fake.deps.run('pgrep', ['-f', 'user-data-dir=/b( |$)']).status).toBe(1);
  });

  it('records each call, including those answered by a replacement run', () => {
    const fake = makeFakeThorChrome({ run: () => ({ status: 3, stderr: '', stdout: '' }) });
    expect(fake.deps.run('pgrep', ['-f', 'x']).status).toBe(3);
    expect(fake.calls).toStrictEqual([{ args: ['-f', 'x'], program: 'pgrep' }]);
  });

  it('puts the required commands on PATH and sets HOME and TMPDIR inside the fixture', () => {
    const fake = makeFakeThorChrome({ env: { THOR_CHROME_PROFILE: 'thrive', TMPDIR: undefined } });
    for (const name of ['curl', 'lsof', 'pgrep']) {
      expect(findOnPath(name, fake.env['PATH'] ?? '')).toBeDefined();
    }
    expect(fake.env['HOME']).toBe(fake.home);
    expect(fake.env['TMPDIR']).toBeUndefined();
    expect(fake.env['THOR_CHROME_PROFILE']).toBe('thrive');
  });

  it('advances the clock only when the run sleeps', async () => {
    const fake = makeFakeThorChrome();
    const started = fake.deps.now();
    await fake.deps.sleep(250);
    expect(fake.deps.now() - started).toBe(250);
  });

  it('records signals and launches, and refuses every signal when asked to', () => {
    const fake = makeFakeThorChrome();
    fake.deps.kill(4_242);
    fake.deps.spawnDetached('chrome', ['--flag'], { logPath: '/log' });
    expect(fake.killed).toStrictEqual([4_242]);
    expect(fake.spawned).toStrictEqual([{ args: ['--flag'], options: { logPath: '/log' }, program: 'chrome' }]);
    expect(() => {
      makeFakeThorChrome({ isKillRefused: true }).deps.kill(1);
    }).toThrow('EPERM');
  });

  it('creates a profile with or without a record', () => {
    const fake = makeFakeThorChrome();
    const bare = fake.makeProfile('thrive');
    const recorded = fake.makeProfile('widget-9', { origin: 'derived', branch: '9' });
    expect(fs.statSync(bare).isDirectory()).toBe(true);
    expect(fs.existsSync(`${bare}/.thor-chrome.record`)).toBe(false);
    expect(fs.readFileSync(`${recorded}/.thor-chrome.record`, 'utf8')).toBe('origin=derived\nbranch=9\n');
  });

  it('builds an invocation that writes to the captured output', () => {
    const fake = makeFakeThorChrome();
    const invocation = fake.makeInvocation('json');
    expect(invocation.format).toBe('json');
    expect(invocation.profilesDir).toBe(fake.profilesDir);
    invocation.output.stdout.write('x');
    expect(fake.captured.stdout()).toBe('x');
  });
});

describe(makeRunningFakeThorChrome, () => {
  it('finds a running browser for each named profile until it is signalled', () => {
    const fake = makeRunningFakeThorChrome(['thrive', 'atlas']);
    const pattern = (name: string) =>
      `user-data-dir=${`${fake.profilesDir}/${name}`.replaceAll('.', String.raw`\.`)}( |$)`;
    expect(fake.deps.run('pgrep', ['-f', pattern('thrive')]).stdout).toBe(`${FIRST_RUNNING_PID}\n`);
    expect(fake.deps.run('pgrep', ['-f', pattern('atlas')]).stdout).toBe(`${FIRST_RUNNING_PID + 1}\n`);
    expect(fake.deps.run('pgrep', ['-f', pattern('other')]).status).toBe(1);
    expect(fake.deps.run('ps', ['-o', 'command=', '-p', '4242']).stdout).toBe('chrome\n');

    fake.deps.kill(FIRST_RUNNING_PID);
    expect(fake.deps.run('pgrep', ['-f', pattern('thrive')]).status).toBe(1);
    expect(fake.killed).toStrictEqual([FIRST_RUNNING_PID]);
    expect(fs.existsSync(`${fake.profilesDir}/atlas`)).toBe(true);
  });
});
