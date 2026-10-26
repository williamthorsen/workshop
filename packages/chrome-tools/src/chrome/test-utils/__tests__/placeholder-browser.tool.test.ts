import { spawnSync } from 'node:child_process';

import { afterAll, describe, expect, it } from 'vitest';

import { isProcessEnumerationDenied, itWithPlaceholderBrowser } from '../placeholder-browser.ts';

const started: number[] = [];

describe(itWithPlaceholderBrowser, () => {
  afterAll(() => {
    for (const pid of started) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // The test already ended it.
      }
    }
  });

  /* eslint-disable vitest/require-hook, vitest/no-standalone-expect -- itWithPlaceholderBrowser registers a test, which
     the rules do not recognize as one. */
  itWithPlaceholderBrowser('starts a process whose argv contains the flags', async (start) => {
    const pid = await start(['--user-data-dir=/profiles/thrive', '--remote-debugging-port=9333']);
    started.push(pid);
    expect(readCommandLine(pid)).toMatch(/ --user-data-dir=\/profiles\/thrive --remote-debugging-port=9333$/);
  });
  /* eslint-enable vitest/require-hook, vitest/no-standalone-expect */

  it.skipIf(isProcessEnumerationDenied)('ends the placeholder once its test finishes', () => {
    const [pid] = started;
    expect(pid).toBeDefined();
    expect(readCommandLine(pid ?? 0)).toBe('');
  });

  it('agrees with ps about whether the process list can be read', () => {
    const ps = spawnSync('ps', ['-o', 'command=', '-p', String(process.pid)], { stdio: 'ignore' });
    expect(ps.status === 0 || isProcessEnumerationDenied).toBe(true);
  });
});

// region | Helpers

/** Returns a process's command line, or an empty string when it is not running. */
function readCommandLine(pid: number): string {
  const result = spawnSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

// endregion | Helpers
