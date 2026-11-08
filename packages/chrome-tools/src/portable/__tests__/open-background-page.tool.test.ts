import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { afterAll, describe, expect, it } from 'vitest';

import { takeClosedPort } from '../../test-utils/closed-port.ts';
import { openBackgroundPage } from '../open-background-page.ts';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Start the browser once at collection, so that every case shares it and the skip is decided before any case runs
const browser = await startHeadlessChrome();

describe(openBackgroundPage, () => {
  afterAll(async () => {
    await browser?.stop();
  });

  it.skipIf(browser === undefined)('opens each page as a target of the browser, in call order', async () => {
    const port = browser?.port ?? '';
    await expect(openBackgroundPage(port, 'data:text/html,one')).resolves.toStrictEqual({ isOpened: true });
    await expect(openBackgroundPage(port, 'data:text/html,two')).resolves.toStrictEqual({ isOpened: true });

    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets: unknown = await response.json();
    expect(Array.isArray(targets)).toBe(true);
    // The browser also lists its own UI as targets of type browser_ui; /json/list puts the newest page first
    const pages = Array.isArray(targets) ? targets.filter((target) => isPageTarget(target)) : [];
    expect(pages.map((page) => page.url)).toStrictEqual(['data:text/html,two', 'data:text/html,one']);
  });

  it('reports the failure on a port where nothing answers', async () => {
    const port = String(await takeClosedPort());
    await expect(openBackgroundPage(port, 'about:blank')).resolves.toStrictEqual({
      isOpened: false,
      reason: expect.stringMatching(/^the DevTools endpoint did not answer: /),
    });
  });
});

// region | Helpers

/** A headless browser started for the suite, with no tab of its own. */
interface HeadlessChrome {
  port: string;
  stop: () => Promise<void>;
}

/** Returns whether a `/json/list` entry is a page target. */
function isPageTarget(target: unknown): target is { url: string } {
  if (typeof target !== 'object' || target === null) return false;
  return 'type' in target && target.type === 'page' && 'url' in target && typeof target.url === 'string';
}

/**
 * Starts Chrome headless on a scratch profile and a free port, or returns `undefined` when Chrome is absent or its
 * endpoint does not answer, as under the agent sandbox, which ends Chrome at once.
 */
async function startHeadlessChrome(): Promise<HeadlessChrome | undefined> {
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
  const stop = async () => {
    await stopProcess(child);
    fs.rmSync(profileDir, { force: true, recursive: true });
  };

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline && child.exitCode === null) {
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

/** Ends a process and waits for its exit. */
async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGKILL');
  await exited;
}

// endregion | Helpers
