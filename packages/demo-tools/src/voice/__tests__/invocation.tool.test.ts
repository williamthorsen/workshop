import { readFileSync } from 'node:fs';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { runInvocation } from '../invocation.ts';

// Writes its pid to the file named by its argument, then runs until it is stopped.
const HANGS = `import { writeFileSync } from 'node:fs';
writeFileSync(process.argv[2], String(process.pid));
setInterval(() => {}, 1000);
`;

describe(runInvocation, () => {
  it('stops the program when the signal aborts, and resolves once it has exited', async () => {
    using tree = createTempTree({ 'hangs.mjs': HANGS });
    const pidPath = tree.resolve('pid');
    const aborter = new AbortController();

    const pending = runInvocation(
      { command: process.execPath, args: [tree.resolve('hangs.mjs'), pidPath], env: {} },
      { signal: aborter.signal },
    );
    await waitForFile(pidPath);
    aborter.abort();
    const outcome = await pending;

    expect(outcome).toMatchObject({ ok: false, message: expect.stringContaining('was stopped by SIGTERM') });
    expect(isRunning(Number(readFileSync(pidPath, 'utf8')))).toBe(false);
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

// region | Helpers

/** Reports whether a process with `pid` exists. */
function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Waits until `filePath` has content. */
async function waitForFile(filePath: string): Promise<void> {
  for (;;) {
    try {
      if (readFileSync(filePath, 'utf8') !== '') return;
    } catch {
      // Not written yet.
    }
    await delay(20);
  }
}

// endregion | Helpers
