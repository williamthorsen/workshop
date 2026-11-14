import fs from 'node:fs';

import { type FakeThorChrome, type FakeThorChromeOptions, makeFakeThorChrome } from './fake-thor-chrome.ts';

/** The PID of the browser that `makeRunningFake` reports as running. */
export const RUNNING_PID = '4242';

/** Returns the bundle that contains a fixture app path. */
export function appBundle(fake: FakeThorChrome, app: string): string {
  return `${fake.home}${app.slice(0, app.indexOf('/Contents/MacOS/'))}`;
}

/** Creates an executable at an app path inside the fixture home and returns its absolute path. */
export function makeExecutable(fake: FakeThorChrome, app: string): string {
  const file = `${fake.home}${app}`;
  fs.mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true });
  fs.writeFileSync(file, '#!/bin/sh\n', { mode: 0o755 });
  return file;
}

/** Builds a fake whose browser app is the runnable `/bin/sh` and whose profile `thrive` exists. */
export function makeLaunchFake(options: FakeThorChromeOptions = {}): FakeThorChrome {
  const fake = makeFakeThorChrome({ ...options, env: { THOR_CHROME_APP: '/bin/sh', ...options.env } });
  fake.makeProfile('thrive');
  return fake;
}

/**
 * Builds a fake whose profile `thrive` exists and has a running browser that declares the given port, started headless
 * when `isHeadless` is set.
 */
export function makeRunningFake(options: {
  isHeadless?: boolean;
  port: string | undefined;
  results?: Record<string, { status?: number; stdout?: string }>;
}): FakeThorChrome {
  const portFlag = options.port === undefined ? '' : ` --remote-debugging-port=${options.port}`;
  const headlessFlag = options.isHeadless === true ? ' --headless' : '';
  return makeLaunchFake({
    results: {
      ...options.results,
      pgrep: { stdout: `${RUNNING_PID}\n` },
      [`ps -o command= -p ${RUNNING_PID}`]: { stdout: `chrome${portFlag}${headlessFlag} --user-data-dir=/p/thrive\n` },
    },
  });
}
