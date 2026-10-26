import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CommandError } from '../errors.ts';
import { runCommand } from '../run-command.ts';

const RUN_COMMAND = path.resolve(import.meta.dirname, '../run-command.ts');

// Each case runs the test's own Node by path, so that nothing depends on a program that the environment supplies.
describe(runCommand, () => {
  it('returns the status and both streams', () => {
    const script = 'process.stdout.write("out"); process.stderr.write("err"); process.exitCode = 3;';
    expect(runCommand(process.execPath, ['-e', script])).toStrictEqual({ status: 3, stderr: 'err', stdout: 'out' });
  });

  it('runs in the given directory with the given environment', () => {
    const script = 'process.stdout.write(`${process.cwd()} ${process.env.PROBE}`);';
    const result = runCommand(process.execPath, ['-e', script], { cwd: '/', env: { PROBE: 'set' } });
    expect(result.stdout).toBe('/ set');
  });

  it('reports a program ended by a signal with the status that the shell gives it', () => {
    const result = runCommand(process.execPath, ['-e', 'process.kill(process.pid, "SIGTERM")']);
    expect(result.status).toBe(143);
  });

  it('throws a CommandError with status 127 for a program that PATH does not contain', () => {
    let thrown: unknown;
    try {
      runCommand('thor-chrome-no-such-program', [], { env: { PATH: '' } });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(CommandError);
    expect(thrown).toMatchObject({
      exitCode: 127,
      message: "required command 'thor-chrome-no-such-program' not found",
    });
  });

  it("writes input to the program's stdin", () => {
    const script = 'process.stdin.pipe(process.stdout);';
    expect(runCommand(process.execPath, ['-e', script], { input: 'fed' }).stdout).toBe('fed');
  });

  it("passes output through to this process's streams under inherit and returns the status", () => {
    const child = 'process.stdout.write("out"); process.stderr.write("err"); process.exitCode = 3;';
    const parent = [
      `import { runCommand } from ${JSON.stringify(RUN_COMMAND)};`,
      `const result = runCommand(process.execPath, ['-e', ${JSON.stringify(child)}], { stdio: 'inherit' });`,
      'process.stdout.write(`|${JSON.stringify(result)}`);',
    ].join('\n');
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', parent], { encoding: 'utf8' });
    expect(result.stderr).toBe('err');
    expect(result.stdout).toBe('out|{"status":3,"stderr":"","stdout":""}');
  });

  it('feeds input to a program whose output is inherited', () => {
    const child = 'process.stdin.pipe(process.stdout);';
    const parent = [
      `import { runCommand } from ${JSON.stringify(RUN_COMMAND)};`,
      `runCommand(process.execPath, ['-e', ${JSON.stringify(child)}], { input: 'fed', stdio: 'inherit' });`,
    ].join('\n');
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', parent], { encoding: 'utf8' });
    expect(result.stdout).toBe('fed');
  });
});
