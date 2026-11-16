import process from 'node:process';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { runInvocation } from '../invocation.ts';

describe(runInvocation, () => {
  it('stops the program when the signal aborts, and resolves once it has exited', async () => {
    const aborter = new AbortController();

    const pending = runInvocation(
      { command: process.execPath, args: ['--eval', 'setInterval(() => {}, 1000)'], env: {} },
      { signal: aborter.signal },
    );
    aborter.abort();

    await expect(pending).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining('was stopped by SIGTERM'),
    });
  });

  it('marks a program that cannot be started', async () => {
    using tree = createTempTree({});

    const outcome = await runInvocation({ command: tree.resolve('missing'), args: [], env: {} });

    expect(outcome).toMatchObject({ ok: false, started: false });
  });

  it('leaves the mark off a program that starts and fails', async () => {
    const outcome = await runInvocation({ command: process.execPath, args: ['--eval', 'process.exit(3)'], env: {} });

    expect(outcome).toStrictEqual({ ok: false, message: expect.stringContaining('exited with code 3') });
  });
});
