import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';

import { it, onTestFinished } from 'vitest';

/** Starts a placeholder browser whose argv contains the given flags, and resolves to its PID once its argv is visible. */
export type StartPlaceholderBrowser = (flags: readonly string[]) => Promise<number>;

/**
 * Whether this environment denies process enumeration, on which every placeholder-browser test depends. The probe
 * covers both paths that thor-chrome reads, since either can be the denied half: The Bash sandbox refuses `ps` at
 * exec because it is setuid, and denies `pgrep` the lookup of com.apple.sysmond that grants access to the process list.
 */
export const isProcessEnumerationDenied = probeProcessEnumeration();

/**
 * Registers a test that receives the means to start placeholder browsers, skipped where process enumeration is denied,
 * and ends every placeholder that it started when the test finishes. It is the only way to start one, so no test can
 * start a placeholder without the skip.
 */
export function itWithPlaceholderBrowser(title: string, body: (start: StartPlaceholderBrowser) => Promise<void>): void {
  it.skipIf(isProcessEnumerationDenied)(title, async () => {
    await body(startPlaceholderBrowser);
  });
}

// region | Helpers

/** Keeps the process alive until SIGTERM, on which it exits at once, as a browser that quits cleanly does. */
const PLACEHOLDER_SCRIPT = "process.on('SIGTERM', () => process.exit(0)); setInterval(() => {}, 1 << 30);";

/** Reports whether `pgrep` or `ps` cannot read the process list. */
function probeProcessEnumeration(): boolean {
  const pgrep = spawnSync('pgrep', ['-f', '.'], { stdio: 'ignore' });
  const ps = spawnSync('ps', ['-o', 'command=', '-p', String(process.pid)], { stdio: 'ignore' });
  return pgrep.status !== 0 || ps.status !== 0;
}

/** Returns a process's command line, or an empty string when it is not running. */
function readCommandLine(pid: number): string {
  const result = spawnSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

/** Starts a placeholder browser and arranges for it to be ended when the current test finishes. */
async function startPlaceholderBrowser(flags: readonly string[]): Promise<number> {
  const child = spawn(process.execPath, ['--eval', PLACEHOLDER_SCRIPT, 'placeholder-browser', ...flags], {
    stdio: 'ignore',
  });
  const { pid } = child;
  if (pid === undefined) throw new Error('the placeholder browser did not start');
  const exited = once(child, 'exit');
  onTestFinished(async () => {
    child.kill('SIGKILL');
    // Wait for the exit, by which Node has reaped the process, so that none outlives the test as a zombie
    await exited;
  });

  const deadline = Date.now() + 5_000;
  while (!readCommandLine(pid).endsWith(flags.join(' '))) {
    if (Date.now() > deadline) throw new Error(`placeholder PID ${pid} never showed its argv`);
    await sleep(20);
  }
  return pid;
}

// endregion | Helpers
