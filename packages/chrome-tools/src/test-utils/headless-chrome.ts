import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { takeClosedPort } from './closed-port.ts';

/** A headless browser started for a suite, with no tab of its own. */
export interface HeadlessChrome {
  port: string;
  stop: () => Promise<void>;
}

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/**
 * Starts Chrome headless on a scratch profile and a free port, or returns `undefined` when Chrome is absent or its
 * endpoint does not answer, as under the agent sandbox, which ends Chrome at once.
 */
export async function startHeadlessChrome(): Promise<HeadlessChrome | undefined> {
  if (!fs.existsSync(CHROME_PATH)) return undefined;
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thor-chrome-cdp-'));
  const port = String(await takeClosedPort());
  const child = spawn(
    CHROME_PATH,
    [
      '--headless',
      '--no-startup-window',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
    ],
    { stdio: 'ignore' },
  );
  async function stop() {
    await stopProcess(child);
    fs.rmSync(profileDir, { force: true, recursive: true });
  }

  const deadlineMilliseconds = Date.now() + 10_000;
  while (Date.now() < deadlineMilliseconds && child.exitCode === null) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return { port, stop };
    } catch {
      // Keep polling until the endpoint answers or the deadline passes
    }
    await sleep(200);
  }
  await stop();
  return undefined;
}

// region | Helpers

/** Ends a process and waits for its exit. */
async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGKILL');
  await exited;
}

// endregion | Helpers
