import fs from 'node:fs';

import type { SpawnDetachedOptions } from '../../portable/spawn-detached.ts';
import type { CommandResult, RunCommand } from '../../shared/run-command.ts';
import { type CapturedOutput, captureOutput } from '../../test-utils/capture-output.ts';
import { type FakeCall, fakeRunCommand } from '../../test-utils/fake-run-command.ts';
import { makeFixtureDir } from '../../test-utils/fixture-dir.ts';
import { makeStubPath } from '../../test-utils/stub-path.ts';
import { createInvocation, type Invocation, type OutputFormat, type ThorChromeDeps } from '../invocation.ts';

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
  /** Builds an invocation over the fake dependencies, writing to `captured`. */
  makeInvocation: (format?: OutputFormat) => Invocation;
  /** Creates a profile directory, with the record that a launch would have left when `record` is given. */
  makeProfile: (name: string, record?: Record<string, string>) => string;
  profilesDir: string;
  /** Parses the JSON object that the run printed on stdout. */
  readReport: () => Record<string, unknown>;
  /** Launches that the run started detached. */
  spawned: Array<{ args: readonly string[]; options: SpawnDetachedOptions; program: string }>;
  /** The working repository's directory, which `git rev-parse --git-common-dir` reports. */
  workRepoDir: string;
}

export interface FakeThorChromeOptions {
  /** Variables set over the fake environment; an `undefined` value removes one. */
  env?: Record<string, string | undefined>;
  /** Makes every signal fail, as for a process owned by another user. */
  isKillRefused?: boolean | undefined;
  /**
   * Answers keyed by a prefix of the `program args` line, tried ahead of the defaults: the working repository on branch
   * `321`, a `pgrep` that finds nothing, a `curl` that reaches the endpoint, an `lsof` that finds every port free, and
   * the GUI login session.
   */
  results?: Record<string, Partial<CommandResult>>;
  /** Replaces the answering `RunCommand` while keeping the recording of calls. */
  run?: RunCommand;
}

/** The PID of the first browser that `makeRunningFakeThorChrome` starts; each further profile takes the next. */
export const FIRST_RUNNING_PID = 4_242;

/** The commands that thor-chrome requires on PATH before it runs them. */
const REQUIRED_COMMANDS = ['curl', 'lsof', 'pgrep'];

/**
 * Builds a fake thor-chrome environment whose clock advances only when the run sleeps, so that a wait reaches its
 * deadline at once.
 */
export function makeFakeThorChrome(options: FakeThorChromeOptions = {}): FakeThorChrome {
  const home = makeFixtureDir();
  const profilesDir = `${home}/.local/share/thor-chrome/profiles`;
  const workRepoDir = `${home}/work/widget`;
  fs.mkdirSync(profilesDir, { recursive: true });
  fs.mkdirSync(`${home}/tmp`);

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

  let clock = 1_767_323_045_000;
  const killed: number[] = [];
  const spawned: FakeThorChrome['spawned'] = [];
  const captured = captureOutput('thor-chrome');
  const deps: ThorChromeDeps = {
    env,
    isStdoutTerminal: false,
    kill: (pid) => {
      if (options.isKillRefused === true) throw new Error('EPERM');
      killed.push(pid);
    },
    now: () => clock,
    run,
    sleep: (milliseconds) => {
      clock += milliseconds;
      return Promise.resolve();
    },
    spawnDetached: (program, args, spawnOptions) => {
      spawned.push({ args, options: spawnOptions, program });
    },
  };

  return {
    advance: (milliseconds) => {
      clock += milliseconds;
    },
    calls: fake.calls,
    captured,
    deps,
    env,
    home,
    killed,
    makeInvocation: (format = 'prose') => createInvocation(captured.output, format, deps),
    makeProfile: (name, record) => {
      const dir = `${profilesDir}/${name}`;
      fs.mkdirSync(dir, { recursive: true });
      if (record !== undefined) {
        const lines = Object.entries(record).map(([key, value]) => `${key}=${value}\n`);
        fs.writeFileSync(`${dir}/.thor-chrome.record`, lines.join(''));
      }
      return dir;
    },
    profilesDir,
    readReport: () => {
      const report: unknown = JSON.parse(captured.stdout());
      if (typeof report !== 'object' || report === null || Array.isArray(report)) {
        throw new Error(`stdout is not a JSON object: ${captured.stdout()}`);
      }
      return { ...report };
    },
    spawned,
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

export interface RunningFakeThorChromeOptions extends Pick<FakeThorChromeOptions, 'isKillRefused'> {
  /** Gives each browser a debugging port, 9000 plus its index, as a thor-chrome launch does. */
  hasPorts?: boolean;
}

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
  const fake = makeFakeThorChrome({
    isKillRefused: options.isKillRefused,
    run: (program, args) => {
      if (program === 'ps') {
        const pid = Number(args.at(-1) ?? '');
        const port = options.hasPorts === true ? ` --remote-debugging-port=${9_000 + pid - FIRST_RUNNING_PID}` : '';
        return { status: 0, stderr: '', stdout: `chrome${port}\n` };
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
