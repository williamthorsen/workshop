import fs from 'node:fs';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { onTestFinished } from 'vitest';

import type { SpawnDetachedOptions } from '../../portable/spawn-detached.ts';
import type { CommandResult, RunCommand } from '../../shared/run-command.ts';
import { type CapturedOutput, captureOutput } from '../../test-utils/capture-output.ts';
import { type FakeCall, fakeRunCommand } from '../../test-utils/fake-run-command.ts';
import { makeStubPath } from '../../test-utils/stub-path.ts';
import { createInvocation, type Invocation, type ThorChromeDeps } from '../invocation.ts';

/** A fake thor-chrome environment: a scratch home, a working repository's answers, and recorded side effects. */
export interface FakeThorChrome {
  /** Moves the fake clock forward. */
  advance: (milliseconds: number) => void;
  calls: FakeCall[];
  captured: CapturedOutput;
  deps: ThorChromeDeps;
  /** The environment that `deps.env` reads, which a test may change before the run. */
  env: Record<string, string>;
  home: string;
  /** PIDs that the run signalled. */
  killed: number[];
  /** Builds an invocation over the fake dependencies. */
  makeInvocation: () => Invocation;
  /** Creates a profile directory, with the record that a launch would have left when `record` is given. */
  makeProfile: (name: string, record?: Record<string, string>) => string;
  /** Pages that the run opened through the DevTools endpoint, failed openings included, in call order. */
  opened: Array<{ port: string; url: string }>;
  profilesDir: string;
  /** DevTools proxies that the run started in this process, with whether each was closed. */
  proxies: Array<{ isClosed: boolean; listenPort: string; upstreamPort: string }>;
  /** Parses the JSON object that the run printed on stdout. */
  readReport: () => Record<string, unknown>;
  /** Launches that the run started detached. */
  spawned: Array<{ args: readonly string[]; options: SpawnDetachedOptions; program: string }>;
  /** Asks the run to terminate, as SIGTERM does, calling every handler that it registered. */
  terminate: () => void;
  /** The working repository's directory, which `git rev-parse --git-common-dir` reports. */
  workRepoDir: string;
}

export interface FakeThorChromeOptions {
  /** Variables set over the fake environment; an `undefined` value removes one. */
  env?: Record<string, string | undefined>;
  /** The error that every signal throws, such as a coded `EPERM` for a process owned by another user. */
  killError?: Error | undefined;
  /** Failure reasons keyed by URL, for the pages whose opening fails. */
  pageFailures?: Record<string, string>;
  /**
   * Answers keyed by a prefix of the `program args` line, tried ahead of the defaults: the working repository on branch
   * `321`, a `pgrep` that finds nothing, a `curl` that reaches the endpoint, an `lsof` that finds every port free, and
   * the GUI login session.
   */
  results?: Record<string, Partial<CommandResult>>;
  /** Replaces the answering `RunCommand` while keeping the recording of calls. */
  run?: RunCommand;
}

/** The script that the fake reports as running thor-chrome. */
export const FAKE_ENTRY_SCRIPT = '/fake/bin/thor-chrome.js';

/** The PID of the first browser that `makeRunningFakeThorChrome` starts; each further profile takes the next. */
export const FIRST_RUNNING_PID = 4242;

/** The commands that thor-chrome requires on PATH before it runs them. */
const REQUIRED_COMMANDS = ['curl', 'git', 'lsof', 'pgrep'];

/**
 * Builds a fake thor-chrome environment whose clock advances only when the run sleeps, so that a wait reaches its
 * deadline at once.
 */
export function makeFakeThorChrome(options: FakeThorChromeOptions = {}): FakeThorChrome {
  const tree = createTempTree({}, { prefix: 'thor-chrome-' });
  onTestFinished(() => {
    tree[Symbol.dispose]();
  });
  const home = tree.dir;
  const profilesDir = tree.mkdir('.local/share/thor-chrome/profiles');
  const workRepoDir = `${home}/work/widget`;
  tree.mkdir('tmp');

  const defaults: Record<string, Partial<CommandResult>> = {
    'git branch --show-current': { stdout: '321\n' },
    'git rev-parse --path-format=absolute --git-common-dir': { stdout: `${workRepoDir}/.git\n` },
    pgrep: { status: 1 },
    curl: { status: 0 },
    lsof: { status: 1 },
    launchctl: { stdout: 'Aqua\n' },
    codesign: { status: 0 },
    open: { status: 0 },
  };
  const overrides = options.results ?? {};
  const results = Object.fromEntries([
    ...Object.entries(overrides),
    ...Object.entries(defaults).filter(([key]) => !Object.hasOwn(overrides, key)),
  ]);
  const fake = fakeRunCommand(results);
  const run: RunCommand =
    options.run === undefined
      ? fake.run
      : (program, args, runOptions) => {
          fake.calls.push({ args, program });
          return options.run?.(program, args, runOptions) ?? { status: 1, stderr: '', stdout: '' };
        };

  const stubs = Object.fromEntries(REQUIRED_COMMANDS.map((name) => [name, 'exit 0']));
  const variables: Record<string, string | undefined> = {
    HOME: home,
    PATH: makeStubPath(stubs, ''),
    TMPDIR: `${home}/tmp`,
    ...options.env,
  };
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(variables).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );

  let clockMilliseconds = 1_767_323_045_000;
  const killed: number[] = [];
  const opened: FakeThorChrome['opened'] = [];
  const spawned: FakeThorChrome['spawned'] = [];
  const proxies: FakeThorChrome['proxies'] = [];
  const terminationHandlers = new Set<() => void>();
  const captured = captureOutput('thor-chrome');
  const deps: ThorChromeDeps = {
    entryScript: FAKE_ENTRY_SCRIPT,
    env,
    isProcessAlive: (pid) => !killed.includes(pid),
    isStdoutTerminal: false,
    kill: (pid) => {
      if (options.killError !== undefined) throw options.killError;
      killed.push(pid);
    },
    now: () => clockMilliseconds,
    onTerminate: (handler) => {
      terminationHandlers.add(handler);
      return () => terminationHandlers.delete(handler);
    },
    openPage: (port, url) => {
      opened.push({ port, url });
      const reason = options.pageFailures?.[url];
      return Promise.resolve(
        reason === undefined ? { isOpened: true, targetId: `target-${opened.length}` } : { isOpened: false, reason },
      );
    },
    run,
    sleep: (milliseconds) => {
      clockMilliseconds += milliseconds;
      return Promise.resolve();
    },
    spawnDetached: (program, args, spawnOptions) => {
      spawned.push({ args, options: spawnOptions, program });
    },
    startCdpProxy: ({ listenPort, upstreamPort }) => {
      const proxy = { isClosed: false, listenPort, upstreamPort };
      proxies.push(proxy);
      return Promise.resolve({
        close: () => {
          proxy.isClosed = true;
          return Promise.resolve();
        },
        port: listenPort,
      });
    },
  };

  return {
    advance: (milliseconds) => {
      clockMilliseconds += milliseconds;
    },
    calls: fake.calls,
    captured,
    deps,
    env,
    home,
    killed,
    makeInvocation: () => createInvocation(captured.output.name, deps),
    makeProfile: (name, record) => {
      const dir = `${profilesDir}/${name}`;
      fs.mkdirSync(dir, { recursive: true });
      if (record !== undefined) {
        const lines = Object.entries(record).map(([key, value]) => `${key}=${value}\n`);
        fs.writeFileSync(`${dir}/.thor-chrome.record`, lines.join(''));
      }
      return dir;
    },
    opened,
    profilesDir,
    proxies,
    readReport: () => {
      const report: unknown = JSON.parse(captured.stdout());
      if (typeof report !== 'object' || report === null || Array.isArray(report)) {
        throw new Error(`stdout is not a JSON object: ${captured.stdout()}`);
      }
      return { ...report };
    },
    spawned,
    terminate: () => {
      for (const handler of terminationHandlers) handler();
    },
    workRepoDir,
  };
}

/** A fake whose browsers can be relaunched and whose client connections a test sets per PID. */
export interface RunningFakeThorChrome extends FakeThorChrome {
  /** `lsof` answers keyed by browser PID; a PID without one answers as having no client connected. */
  lsof: Map<number, Partial<CommandResult>>;
  /** Ends a profile's browser and starts another under the next PID. */
  relaunch: (profile: string) => number;
}

export interface RunningFakeThorChromeOptions extends Pick<FakeThorChromeOptions, 'killError'> {
  /** Gives each browser a debugging port, 9000 plus its index. */
  hasPorts?: boolean;
  /**
   * Starts each browser on port `0` behind a DevTools proxy, whose PID is the browser's plus `PROXY_PID_OFFSET` and
   * whose advertised port is 9000 plus the browser's index. The proxy exits once it is signalled.
   */
  hasProxies?: boolean;
}

/** The difference between the PID of a browser that `makeRunningFakeThorChrome` starts and that of its proxy. */
export const PROXY_PID_OFFSET = 1000;

/**
 * Builds a fake in which each named profile exists and has a running browser, PID 4242 and up, which exits once it is
 * signalled. A browser has no debugging port unless `hasPorts` is set. Git reports the working repository on branch
 * `321`, and every other call succeeds with empty output.
 */
export function makeRunningFakeThorChrome(
  profiles: readonly string[],
  options: RunningFakeThorChromeOptions = {},
): RunningFakeThorChrome {
  const ended = new Set<number>();
  const lsof = new Map<number, Partial<CommandResult>>();
  let nextPid = FIRST_RUNNING_PID + profiles.length;
  let patterns = new Map<string, number>();
  let proxyPatterns = new Map<string, number>();
  const fake = makeFakeThorChrome({
    killError: options.killError,
    run: (program, args) => {
      if (program === 'ps') {
        return { status: 0, stderr: '', stdout: `${describeRunningProcess(Number(args.at(-1) ?? ''), options)}\n` };
      }
      if (program === 'lsof') {
        const answer = lsof.get(Number(args[3] ?? '')) ?? {};
        return { status: 1, stderr: '', stdout: '', ...answer };
      }
      if (program === 'git' && args[0] === 'branch') return { status: 0, stderr: '', stdout: '321\n' };
      if (program === 'git' && args[0] === 'rev-parse') {
        return { status: 0, stderr: '', stdout: `${fake.workRepoDir}/.git\n` };
      }
      if (program !== 'pgrep') return { status: 0, stderr: '', stdout: '' };
      const proxyPid = proxyPatterns.get(args[1] ?? '');
      if (proxyPid !== undefined) {
        const isServing = options.hasProxies === true && !fake.killed.includes(proxyPid);
        return isServing ? { status: 0, stderr: '', stdout: `${proxyPid}\n` } : { status: 1, stderr: '', stdout: '' };
      }
      const pid = patterns.get(args[1] ?? '');
      if (pid === undefined || ended.has(pid)) return { status: 1, stderr: '', stdout: '' };
      return { status: 0, stderr: '', stdout: `${pid}\n` };
    },
  });
  patterns = new Map(
    profiles.map((profile, index) => {
      const dir = `${fake.profilesDir}/${profile}`.replaceAll('.', String.raw`\.`);
      return [`user-data-dir=${dir}( |$)`, FIRST_RUNNING_PID + index];
    }),
  );
  proxyPatterns = new Map(
    profiles.map((profile, index) => {
      const dir = `${fake.profilesDir}/${profile}`.replaceAll('.', String.raw`\.`);
      return [`serve-proxy .*--profile-dir ${dir}( |$)`, FIRST_RUNNING_PID + PROXY_PID_OFFSET + index];
    }),
  );
  const { kill } = fake.deps;
  fake.deps.kill = (pid) => {
    kill(pid);
    ended.add(pid);
  };
  for (const profile of profiles) fake.makeProfile(profile);
  return {
    ...fake,
    lsof,
    relaunch: (profile) => {
      const pattern = `user-data-dir=${fake.profilesDir}/${profile}`.replaceAll('.', String.raw`\.`) + '( |$)';
      const previous = patterns.get(pattern);
      if (previous !== undefined) ended.add(previous);
      const pid = nextPid;
      nextPid += 1;
      patterns.set(pattern, pid);
      return pid;
    },
  };
}

// region | Helpers

/** Returns the command line of a browser or a proxy that `makeRunningFakeThorChrome` started. */
function describeRunningProcess(pid: number, options: RunningFakeThorChromeOptions): string {
  if (pid >= FIRST_RUNNING_PID + PROXY_PID_OFFSET) {
    return `node thor-chrome.js serve-proxy --port ${9000 + pid - FIRST_RUNNING_PID - PROXY_PID_OFFSET}`;
  }
  if (options.hasProxies === true) return 'chrome --remote-debugging-port=0';
  if (options.hasPorts === true) return `chrome --remote-debugging-port=${9000 + pid - FIRST_RUNNING_PID}`;
  return 'chrome';
}

// endregion | Helpers
