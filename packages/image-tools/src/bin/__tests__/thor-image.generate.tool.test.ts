import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WORKER_PATH } from '../../worker/run-worker.ts';
import { createFakeUv, FAKE_FAIL_AT } from '../test-utils/create-fake-uv.ts';

const ENTRY_POINT = path.join(import.meta.dirname, '../thor-image.ts');

describe('thor-image generate, through uv', () => {
  it('renders every style and seed in one worker process and writes the images and the record', () => {
    using machine = createFakeUv();

    const { status, stderr, stdout } = runThorImage(machine.tree.dir, machine.env, [
      'a lighthouse',
      '--style',
      'oil',
      '--style',
      'noir',
      '--seed',
      '1',
      '--seed',
      '2',
      '--output-dir',
      'out',
    ]);

    expect({ status, stderr }).toMatchObject({
      status: 0,
      stderr: expect.stringContaining('rendered noir, seed 2 (4/4)'),
    });
    expect(stderr).toContain('fake mflux: loading qwen-image-2.1-turbo');
    const calls = machine.readCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toStrictEqual([
      'run',
      '--no-project',
      '--python',
      '3.12',
      '--with',
      'mflux==0.24.0',
      'python',
      WORKER_PATH,
    ]);

    const [runName] = readdirSync(machine.tree.resolve('out'));
    const runDir = machine.tree.resolve(`out/${runName}`);
    expect(stdout).toBe(`thor-image generate: wrote 4 images and run.json to ${runDir}\n`);
    expect(readdirSync(runDir).toSorted()).toStrictEqual([
      'noir-1.png',
      'noir-2.png',
      'oil-1.png',
      'oil-2.png',
      'run.json',
    ]);
    expect(JSON.parse(readFileSync(path.join(runDir, 'run.json'), 'utf8'))).toMatchObject({
      dryRun: false,
      images: [{ file: 'oil-1.png', mfluxVersion: '0.24.0', settings: { steps: 8 } }, {}, {}, {}],
    });
  });

  it('records a failure partway and exits 1', () => {
    using machine = createFakeUv();

    const { status, stderr } = runThorImage(machine.tree.dir, { ...machine.env, [FAKE_FAIL_AT]: '1' }, [
      'a fox',
      '--style',
      'oil',
      '--seed',
      '1',
      '--seed',
      '2',
      '--output-dir',
      'out',
    ]);

    expect(status).toBe(1);
    expect(stderr).toContain('thor-image: image 2 failed: out of memory; wrote 1 of 2 images and run.json');
  });

  it('exits 127 when uv is not on PATH', () => {
    using machine = createFakeUv();

    const { status, stderr } = runThorImage(machine.tree.dir, { ...machine.env, PATH: machine.tree.resolve('empty') }, [
      'a fox',
      '--style',
      'oil',
    ]);

    expect(status).toBe(127);
    expect(stderr).toContain('uv is not on PATH');
  });
});

// region | Helpers

/** Runs the CLI's TypeScript entry point, whose types node strips, in `cwd` with `env` in place of PATH. */
function runThorImage(
  cwd: string,
  env: Record<string, string>,
  args: string[],
): { status: number | null; stderr: string; stdout: string } {
  const { status, stderr, stdout } = spawnSync(process.execPath, [ENTRY_POINT, 'generate', ...args], {
    cwd,
    encoding: 'utf8',
    env: { HOME: cwd, ...env },
  });
  return { status, stderr, stdout };
}

// endregion | Helpers
