import { setTimeout as sleep } from 'node:timers/promises';
import tty from 'node:tty';

import { openBackgroundPage } from '../portable/open-background-page.ts';
import { spawnDetached } from '../portable/spawn-detached.ts';
import { startCdpProxy } from '../proxy/cdp-proxy.ts';
import { runCommand } from '../shared/run-command.ts';
import type { ThorChromeDeps } from './invocation.ts';

/** Builds the dependencies of a run in this process. */
export function createProcessDeps(): ThorChromeDeps {
  return {
    entryScript: process.argv[1] ?? '',
    env: process.env,
    isProcessAlive: (pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        // EPERM means that the process exists but belongs to another user
        return error instanceof Error && 'code' in error && error.code === 'EPERM';
      }
    },
    isStdoutTerminal: tty.isatty(1),
    kill: (pid) => {
      process.kill(pid, 'SIGTERM');
    },
    now: () => Date.now(),
    onTerminate: (handler) => {
      process.once('SIGTERM', handler);
      process.once('SIGINT', handler);
      return () => {
        process.off('SIGTERM', handler);
        process.off('SIGINT', handler);
      };
    },
    openPage: openBackgroundPage,
    run: runCommand,
    sleep: async (milliseconds) => {
      await sleep(milliseconds);
    },
    spawnDetached,
    startCdpProxy,
  };
}
