import fs from 'node:fs';

import { isDirectory } from '../shared/paths.ts';
import {
  readLaunchSession,
  resolveAppBundle,
  resolveBrowserApp,
  resolveBrowserName,
  SESSION_RECOVERY,
  SESSION_RECOVERY_HINT,
} from './browser.ts';
import { findBrowserPid, probeDevtools, PROXIED_PORT } from './browser-process.ts';
import { readDevtoolsActivePort, removeDevtoolsActivePort } from './devtools-active-port.ts';
import { composeInstanceLabel, INSTANCE_PAGE_FILE, writeInstancePage } from './instance-page.ts';
import { type Invocation, refuse, requireCommand, runTolerantly } from './invocation.ts';
import { POLICY_DENIAL_MESSAGE, readLogFile, resolveLogPath } from './launch-log.ts';
import { openPages } from './open-pages.ts';
import { assertPortAvailable, assertPortFree } from './port-availability.ts';
import { assertValidPort, resolvePort } from './ports.ts';
import {
  assertProfileNotUnderived,
  composeProfileEntry,
  resolveDefaultProfile,
  type WorkOverrides,
  writeProfileRecord,
} from './profiles.ts';
import type { LaunchPlanResult, LaunchResult } from './results.ts';
import { startProxy } from './serve-proxy.ts';
import { readLaunchTimeout, type Timeout } from './timeouts.ts';

/** The options of a launch, as parsed from its command line. */
export interface LaunchOptions {
  browser: string | undefined;
  isCreate: boolean;
  isDryRun: boolean;
  isHeadless: boolean;
  port: string | undefined;
  profile: string | undefined;
  urls: readonly string[];
  work: WorkOverrides;
}

/**
 * Every launch passes all of these, whichever browser it names: Each is inert when its prompt would not appear, and
 * because a profile is per-branch, a launch against a fresh profile is the common case.
 */
const PROMPT_SUPPRESSION_FLAGS = [
  '--disable-search-engine-choice-screen',
  '--hide-crash-restore-bubble',
  '--no-default-browser-check',
  '--no-first-run',
];

/**
 * Every launch starts the browser without a window and opens its pages through the DevTools endpoint as background
 * targets, because a browser activates itself whenever it opens a window from its command line, `open -g` or not.
 */
const NO_STARTUP_WINDOW_FLAG = '--no-startup-window';

/** Chrome's flag for its headless mode, which since Chrome 132 is the only one and takes no value. */
const HEADLESS_FLAG = '--headless';

const LAUNCH_POLL_INTERVAL_MILLISECONDS = 200;

/**
 * Launches the browser against the named or derived profile, or returns the command that would launch it.
 *
 * A launch returns only once the DevTools endpoint answers on the advertised port. The browser chooses its own port,
 * which it records in `DevToolsActivePort`, and once that endpoint answers, the launch starts a DevTools proxy on the
 * advertised port, through which no client can bring the browser to the front. The browser declines to open the port
 * at all under the RemoteDebuggingAllowed enterprise policy, naming the refusal on its own output, so the launch keeps
 * that output and reads it back rather than reporting an endpoint that will never exist.
 *
 * No launch brings the browser to the front: The browser starts without a window, and once the proxy answers, the
 * launch opens each page through it as a background target, which creates the window without activating the browser.
 * A launch against a running profile starts nothing and opens its URLs in that instance the same way, starting the
 * proxy first when the browser has lost it.
 *
 * A headless launch always starts the browser directly, since a browser without a window needs neither the Dock icon
 * nor the keyboard input that the GUI login session provides.
 *
 * A browser started directly registers in the launching shell's launchd session, and outside the GUI login session
 * (`launchctl managername` other than Aqua) it gets no Dock icon, no ⌘-Tab entry, and no keyboard input. There the
 * launch goes through `open -g -n`, which starts it in the console session. Inside it, the launch stays direct, because
 * the agent sandbox refuses `open`.
 */
export async function launchProfile(
  invocation: Invocation,
  options: LaunchOptions,
): Promise<LaunchPlanResult | LaunchResult> {
  const { dir: profileDir, name: profile } = resolveDefaultProfile(invocation, options.profile ?? '', options.work);
  if (options.port !== undefined) assertValidPort(invocation, options.port);

  requireCommand(invocation, 'curl');
  requireCommand(invocation, 'pgrep');
  requireCommand(invocation, 'lsof');

  const port = resolvePort(invocation, options.port);
  const browser = resolveBrowserName(invocation, options.browser);
  const browserApp = resolveBrowserApp(invocation, browser);

  assertProfileCreatable(invocation, { isCreate: options.isCreate, profile, profileDir });

  const running = assertPortAvailable(invocation, { isHeadless: options.isHeadless, port, profile, profileDir });
  const runningPid = running?.pid;
  const isHeadless = running?.isHeadless ?? options.isHeadless;
  const label = composeInstanceLabel(profile, port);
  const commandLine = [
    browserApp,
    `--remote-debugging-port=${PROXIED_PORT}`,
    `--user-data-dir=${profileDir}`,
    ...PROMPT_SUPPRESSION_FLAGS,
    NO_STARTUP_WINDOW_FLAG,
    ...(options.isHeadless ? [HEADLESS_FLAG] : []),
  ];

  // Only a launch that starts the browser opens the instance page
  const pageFile = runningPid === undefined ? `${profileDir}/${INSTANCE_PAGE_FILE}` : undefined;
  const pages = composePages(options.urls, pageFile);

  // Because the endpoint alone cannot tell a slow start from a policy refusal, the browser's own output is kept for the
  // failure report to read back
  const logFile = resolveLogPath(invocation, profile);

  const session = readLaunchSession(invocation);
  const isOpenLaunch = !options.isHeadless && session !== '' && session !== 'Aqua';
  const launchCommand =
    runningPid === undefined
      ? composeLaunchCommand(invocation, commandLine, isOpenLaunch ? session : undefined, logFile)
      : undefined;

  if (options.isDryRun) return { command: launchCommand, pages, port, profile, type: 'launch-plan' };

  const deadline: Deadline = { startedMilliseconds: invocation.deps.now(), timeout: readLaunchTimeout(invocation) };

  // Write no record for an underived profile: The derivation that would say where it came from was lost
  fs.mkdirSync(profileDir, { recursive: true });
  if (invocation.origin !== 'underived') writeProfileRecord(invocation, profileDir);
  let pid = runningPid;
  if (launchCommand !== undefined) {
    if (pageFile !== undefined) {
      writeInstancePage(invocation, { browser, browserApp, label, launchCommand, logFile, pageFile, port, profile });
    }
    const openSession = isOpenLaunch ? session : undefined;
    pid = await startAndAwaitBrowser(
      invocation,
      { launchCommand, logFile, openSession, profile, profileDir },
      deadline,
    );
  }
  // A browser that the launch started has no proxy yet, and one that was running may have lost it
  if (pid !== undefined && running?.isProxyMissing !== false) {
    await serveThroughProxy(invocation, { pid, port, profile, profileDir }, deadline);
  }
  const relaunchOptions = composeRelaunchOptions(invocation, { ...options, isHeadless }, profile);
  await openPages(invocation, { port, profile, relaunchOptions }, pages);
  const entry = composeProfileEntry(invocation, profile, { isHeadless, pid, port, state: 'debugging' });
  return { browser, entry, type: 'launch' };
}

// region | Helpers

/** The launch budget, counted from the moment that the launch started to wait. */
interface Deadline {
  startedMilliseconds: number;
  timeout: Timeout;
}

/**
 * Refuses a profile that does not exist unless the launch may create it. A derived name contains no typo, so only a
 * name given on the command line has to be confirmed with --create.
 */
function assertProfileCreatable(
  invocation: Invocation,
  request: { isCreate: boolean; profile: string; profileDir: string },
): void {
  const { isCreate, profile, profileDir } = request;
  const { programName: name } = invocation;
  if (isDirectory(profileDir) || isCreate || invocation.origin === 'derived') return;
  assertProfileNotUnderived(invocation, `${name} --repo <repo> --branch <branch>`);
  throw refuse(invocation, 'profile-missing', `profile '${profile}' does not exist at ${profileDir}`, {
    hints: [`Pass --create to make it, or list existing profiles: ${name} list`],
  });
}

/**
 * Reports whether the browser's own DevTools endpoint answers within the launch budget, at the port that it records in
 * `DevToolsActivePort`.
 */
async function awaitBrowserEndpoint(invocation: Invocation, profileDir: string, deadline: Deadline): Promise<boolean> {
  return awaitCondition(invocation, deadline, () => {
    const browserPort = readDevtoolsActivePort(profileDir);
    return browserPort !== undefined && probeDevtools(invocation, browserPort);
  });
}

/**
 * Returns the PID of the browser that the launch started, which the DevTools proxy watches, refusing with
 * `launch-timeout` when the process list does not show it within the launch budget.
 */
async function awaitBrowserPid(
  invocation: Invocation,
  launched: { logFile: string; profile: string; profileDir: string },
  deadline: Deadline,
): Promise<string> {
  const { logFile, profile, profileDir } = launched;
  let pid: string | undefined;
  const isFound = await awaitCondition(invocation, deadline, () => {
    const lookup = findBrowserPid(invocation, profileDir);
    pid = lookup.isReadable ? lookup.pid : undefined;
    return pid !== undefined;
  });
  if (isFound && pid !== undefined) return pid;
  throw refuse(
    invocation,
    'launch-timeout',
    `profile '${profile}' answers, but its browser process was not found after ${deadline.timeout.text}s`,
    { extra: { log: logFile }, hints: [`Browser output: ${logFile}`] },
  );
}

/** Reports whether a condition holds before the launch budget runs out, checking it at each poll. */
async function awaitCondition(invocation: Invocation, deadline: Deadline, condition: () => boolean): Promise<boolean> {
  const { deps } = invocation;
  while (!condition()) {
    if (deps.now() - deadline.startedMilliseconds > deadline.timeout.seconds * 1000) return false;
    await deps.sleep(LAUNCH_POLL_INTERVAL_MILLISECONDS);
  }
  return true;
}

/**
 * Returns the command that starts the browser: the command line itself, or, given the launchd session outside the GUI
 * login session that made it necessary, `open` with the command line as its arguments.
 */
function composeLaunchCommand(
  invocation: Invocation,
  commandLine: readonly string[],
  openSession: string | undefined,
  logFile: string,
): readonly string[] {
  const [browserApp = '', ...args] = commandLine;
  if (openSession === undefined) return commandLine;
  const bundle = resolveAppBundle(invocation, browserApp, openSession);
  return ['open', '-g', '-n', '-a', bundle, '--stdout', logFile, '--stderr', logFile, '--args', ...args];
}

/**
 * Returns the pages that a launch opens, in order. A launch that starts the browser opens the instance page after a tab
 * of another kind, a blank one when no URL is given, because Chromium reports targets to a client in the order of the
 * calls that created them, and the Playwright MCP server works in the first one.
 */
function composePages(urls: readonly string[], pageFile: string | undefined): string[] {
  if (pageFile === undefined) return [...urls];
  return [...(urls.length === 0 ? ['about:blank'] : urls), `file://${pageFile}`];
}

/**
 * Returns the launch options that select the same instance again: the profile only when it was named, since naming a
 * derived profile records it as named, and the work overrides, the port, and the mode as this launch was given them.
 */
function composeRelaunchOptions(invocation: Invocation, options: LaunchOptions, profile: string): string[] {
  return [
    ...(invocation.origin === 'named' ? ['--profile', profile] : []),
    ...(options.work.repo === undefined ? [] : ['--repo', options.work.repo]),
    ...(options.work.branch === undefined ? [] : ['--branch', options.work.branch]),
    ...(options.port === undefined ? [] : ['--port', options.port]),
    ...(options.isHeadless ? ['--headless'] : []),
  ];
}

/**
 * Returns the refusal that explains a launch that produced no DevTools endpoint, naming the policy refusal when the
 * browser reported one, since no retry can clear it.
 */
function describeLaunchFailure(invocation: Invocation, profile: string, logFile: string, timeout: string) {
  const { programName: name } = invocation;
  if (readLogFile(logFile).includes(POLICY_DENIAL_MESSAGE)) {
    return refuse(invocation, 'policy-denied', `policy blocked remote debugging for profile '${profile}'`, {
      extra: { log: logFile },
      hints: [
        'The browser reads policy cached in the profile at startup, so no launch of this profile opens a port.',
        'Quit the instance and relaunch with --browser chrome-for-testing, which policy does not govern:',
        `  ${name} quit ${profile}`,
        `Browser output: ${logFile}`,
      ],
    });
  }
  return refuse(
    invocation,
    'launch-timeout',
    `profile '${profile}' started but its DevTools endpoint does not answer after ${timeout}s`,
    {
      extra: { log: logFile },
      hints: [`Browser output: ${logFile}`],
    },
  );
}

/**
 * Starts the profile's DevTools proxy on the advertised port and waits for it to answer, refusing with `port-busy` when
 * another process holds the port and with `launch-timeout`, naming the proxy's log, when the proxy does not answer
 * within the launch budget. The browser stays running after a refusal, and a relaunch starts the proxy again.
 */
async function serveThroughProxy(
  invocation: Invocation,
  target: { pid: string; port: string; profile: string; profileDir: string },
  deadline: Deadline,
): Promise<void> {
  const { pid, port, profile, profileDir } = target;
  assertPortFree(invocation, port);
  const proxyLog = startProxy(invocation, { browserPid: pid, port, profile, profileDir });
  if (await awaitCondition(invocation, deadline, () => probeDevtools(invocation, port))) return;
  throw refuse(
    invocation,
    'launch-timeout',
    `profile '${profile}' started but its DevTools proxy does not answer on port ${port} after ${deadline.timeout.text}s`,
    { extra: { log: proxyLog }, hints: [`Proxy output: ${proxyLog}`] },
  );
}

/**
 * Starts the browser and returns its PID once its own DevTools endpoint answers, refusing when it does not answer, or
 * its process is not found, within the launch budget.
 */
async function startAndAwaitBrowser(
  invocation: Invocation,
  launch: {
    launchCommand: readonly string[];
    logFile: string;
    openSession: string | undefined;
    profile: string;
    profileDir: string;
  },
  deadline: Deadline,
): Promise<string> {
  const { launchCommand, logFile, openSession, profile, profileDir } = launch;
  // A browser that crashed left its port behind, which would point the launch at a dead endpoint
  removeDevtoolsActivePort(profileDir);
  startBrowser(invocation, launchCommand, logFile, openSession);
  if (!(await awaitBrowserEndpoint(invocation, profileDir, deadline))) {
    throw describeLaunchFailure(invocation, profile, logFile, deadline.timeout.text);
  }
  return awaitBrowserPid(invocation, { logFile, profile, profileDir }, deadline);
}

/**
 * Starts the browser: through `open`, given the launchd session outside the GUI login session that made it necessary,
 * or detached in this session.
 */
function startBrowser(
  invocation: Invocation,
  launchCommand: readonly string[],
  logFile: string,
  openSession: string | undefined,
): void {
  const [program = '', ...args] = launchCommand;
  if (openSession === undefined) {
    invocation.deps.spawnDetached(program, args, { logPath: logFile });
    return;
  }
  // Empty the log first, so that a policy refusal left by an earlier launch is not read back as this one's; open
  // returns once LaunchServices accepts the launch, so it runs in the foreground
  fs.writeFileSync(logFile, '');
  if (runTolerantly(invocation, program, args).status !== 0) {
    throw refuse(
      invocation,
      'session-unavailable',
      `the shell is outside the GUI login session (launchctl managername: ${openSession}), and open refused the launch; ${SESSION_RECOVERY}`,
      { hints: [SESSION_RECOVERY_HINT] },
    );
  }
}
// endregion | Helpers
