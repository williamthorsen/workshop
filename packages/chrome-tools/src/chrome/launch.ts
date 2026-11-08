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
import { findBrowserPid, probeDevtools } from './browser-process.ts';
import { composeInstanceLabel, INSTANCE_PAGE_FILE, writeInstancePage } from './instance-page.ts';
import { type Invocation, refuse, requireCommand, runTolerantly } from './invocation.ts';
import { POLICY_DENIAL_MESSAGE, readLogFile, resolveLogPath } from './launch-log.ts';
import { openPages } from './open-pages.ts';
import { assertPortAvailable } from './port-availability.ts';
import { assertValidPort, resolvePort } from './ports.ts';
import {
  assertProfileNotUnderived,
  resolveDefaultProfile,
  type WorkOverrides,
  writeProfileRecord,
} from './profiles.ts';
import { formatCommandLine, type ProfileReport, renderProfile, writeJson, writeProse } from './render.ts';
import { readTimeoutSeconds } from './timeouts.ts';

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

export const DEFAULT_LAUNCH_TIMEOUT_SECONDS = 10;
const LAUNCH_POLL_INTERVAL_MILLISECONDS = 200;

/**
 * Launches the browser against the named or derived profile, or reports the command that would launch it.
 *
 * A launch is reported only once the DevTools endpoint answers. The browser declines to open the port at all under the
 * RemoteDebuggingAllowed enterprise policy, naming the refusal on its own output, so the launch keeps that output and
 * reads it back rather than reporting an endpoint that will never exist.
 *
 * No launch brings the browser to the front: The browser starts without a window, and once its endpoint answers, the
 * launch opens each page as a background target, which creates the window without activating the browser. A launch
 * against a running profile starts nothing and opens its URLs in that instance the same way.
 *
 * A headless launch always starts the browser directly, since a browser without a window needs neither the Dock icon
 * nor the keyboard input that the GUI login session provides.
 *
 * A browser started directly registers in the launching shell's launchd session, and outside the GUI login session
 * (`launchctl managername` other than Aqua) it gets no Dock icon, no ⌘-Tab entry, and no keyboard input. There the
 * launch goes through `open -g -n`, which starts it in the console session. Inside it, the launch stays direct, because
 * the agent sandbox refuses `open`.
 */
export async function launchProfile(invocation: Invocation, options: LaunchOptions): Promise<number> {
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
    `--remote-debugging-port=${port}`,
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

  if (options.isDryRun) {
    reportDryRun(invocation, { launchCommand, pages, port, profile });
    return 0;
  }

  const timeout = readTimeoutSeconds(invocation, 'THOR_CHROME_LAUNCH_TIMEOUT', DEFAULT_LAUNCH_TIMEOUT_SECONDS);

  // Write no record for an underived profile: The derivation that would say where it came from was lost
  fs.mkdirSync(profileDir, { recursive: true });
  if (invocation.origin !== 'underived') writeProfileRecord(invocation, profileDir);
  if (launchCommand !== undefined) {
    if (pageFile !== undefined) {
      writeInstancePage(invocation, { browser, browserApp, label, launchCommand, logFile, pageFile, port, profile });
    }
    startBrowser(invocation, launchCommand, logFile, isOpenLaunch ? session : undefined);
    if (!(await awaitDevtools(invocation, port, timeout.seconds))) {
      throw describeLaunchFailure(invocation, profile, port, logFile, timeout.text);
    }
  }
  await openPages(invocation, profile, port, pages);
  reportLaunch(invocation, { browser, isHeadless, port, profile, profileDir });
  return 0;
}

// region | Helpers

/**
 * Refuses a profile that does not exist unless the launch may create it. A derived name contains no typo, so only a
 * name given on the command line has to be confirmed with --create.
 */
function assertProfileCreatable(
  invocation: Invocation,
  request: { isCreate: boolean; profile: string; profileDir: string },
): void {
  const { isCreate, profile, profileDir } = request;
  const { name } = invocation.output;
  if (isDirectory(profileDir) || isCreate || invocation.origin === 'derived') return;
  assertProfileNotUnderived(invocation, `${name} --repo <repo> --branch <branch>`);
  throw refuse(invocation, 'profile-missing', `profile '${profile}' does not exist at ${profileDir}`, {
    hints: [`Pass --create to make it, or list existing profiles: ${name} list`],
  });
}

/** Reports whether the DevTools endpoint answers within the launch budget. */
async function awaitDevtools(invocation: Invocation, port: string, timeoutSeconds: number): Promise<boolean> {
  const { deps } = invocation;
  const started = deps.now();
  while (!probeDevtools(invocation, port)) {
    if (deps.now() - started > timeoutSeconds * 1000) return false;
    await deps.sleep(LAUNCH_POLL_INTERVAL_MILLISECONDS);
  }
  return true;
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
 * Returns the refusal that explains a launch that produced no DevTools endpoint, naming the policy refusal when the
 * browser reported one, since no retry can clear it.
 */
function describeLaunchFailure(
  invocation: Invocation,
  profile: string,
  port: string,
  logFile: string,
  timeout: string,
) {
  const { name } = invocation.output;
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
    `profile '${profile}' started but nothing answers on port ${port} after ${timeout}s`,
    {
      extra: { log: logFile },
      hints: [`Browser output: ${logFile}`],
    },
  );
}

/**
 * Reports what a launch would do: the command that would start the browser, or that the profile is running when
 * nothing would start, then the pages that it would open.
 */
function reportDryRun(
  invocation: Invocation,
  plan: { launchCommand: readonly string[] | undefined; pages: readonly string[]; port: string; profile: string },
): void {
  const { launchCommand, pages, port, profile } = plan;
  if (invocation.format === 'json') {
    writeJson(invocation, {
      command: launchCommand === undefined ? null : [...launchCommand],
      pages: [...pages],
      dryRun: true,
    });
    return;
  }
  const start =
    launchCommand === undefined ? `profile '${profile}' is running on port ${port}` : formatCommandLine(launchCommand);
  writeProse(invocation, 'stdout', [start, ...pages.map((page) => `Opens: ${page}`)]);
}

/** Reports the launched profile and the browser that serves it, naming a headless one as such. */
function reportLaunch(
  invocation: Invocation,
  launch: { browser: string; isHeadless: boolean; port: string; profile: string; profileDir: string },
): void {
  const { browser, isHeadless, port, profile, profileDir } = launch;
  if (invocation.format === 'json') {
    const lookup = findBrowserPid(invocation, profileDir);
    const pid = lookup.isReadable ? lookup.pid : undefined;
    const report: ProfileReport = { isHeadless, name: profile, path: profileDir, pid, port, state: 'debugging' };
    writeJson(invocation, { profile: renderProfile(invocation, report), browser });
    return;
  }
  writeProse(invocation, 'stdout', [
    `${browser}: profile '${profile}' on port ${port}${isHeadless ? ' (headless)' : ''}`,
    `DevTools: http://127.0.0.1:${port}/json/version`,
  ]);
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
