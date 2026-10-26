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
import { describePortListener, findBrowserPid, probeDevtools, readDebuggingPort } from './browser-process.ts';
import { composeInstanceLabel, INSTANCE_PAGE_FILE, writeInstancePage } from './instance-page.ts';
import { type Invocation, PROCESS_LIST_RECOVERY_HINT, refuse, requireCommand, runTolerantly } from './invocation.ts';
import { assertValidPort, MAX_DERIVED_PORT, MIN_DERIVED_PORT, resolvePort } from './ports.ts';
import { assertProfileNotUnderived, resolveDefaultProfile, writeProfileRecord } from './profiles.ts';
import { formatCommandLine, renderProfile, writeJson, writeProse } from './render.ts';
import { readTimeoutSeconds } from './timeouts.ts';

/** The options of a launch, as parsed from its command line. */
export interface LaunchOptions {
  browser: string | undefined;
  isCreate: boolean;
  isDryRun: boolean;
  port: string | undefined;
  profile: string | undefined;
  urls: readonly string[];
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

/** Verbatim fragment of the message printed by a browser when the RemoteDebuggingAllowed policy denies the port. */
const POLICY_DENIAL_MESSAGE = 'disallowed by the system admin';

export const DEFAULT_LAUNCH_TIMEOUT_SECONDS = 10;
const LAUNCH_POLL_INTERVAL_MILLISECONDS = 200;

/**
 * Launches the browser against the named or derived profile, or reports the command that would launch it.
 *
 * A launch is reported only once the DevTools endpoint answers. The browser declines to open the port at all under the
 * RemoteDebuggingAllowed enterprise policy, naming the refusal on its own output, so the launch keeps that output and
 * reads it back rather than reporting an endpoint that will never exist.
 *
 * A browser started directly registers in the launching shell's launchd session, and outside the GUI login session
 * (`launchctl managername` other than Aqua) it gets no Dock icon, no ⌘-Tab entry, and no keyboard input. There the
 * launch goes through `open -n`, which starts it in the console session. Inside it, the launch stays direct, because
 * the agent sandbox refuses `open`.
 */
export async function launchProfile(invocation: Invocation, options: LaunchOptions): Promise<number> {
  const { output } = invocation;
  const { dir: profileDir, name: profile } = resolveDefaultProfile(invocation, options.profile ?? '');
  if (options.port !== undefined) assertValidPort(invocation, options.port);

  requireCommand(invocation, 'curl');
  requireCommand(invocation, 'pgrep');
  requireCommand(invocation, 'lsof');

  const port = resolvePort(invocation, options.port);
  const browser = resolveBrowserName(invocation, options.browser);
  const browserApp = resolveBrowserApp(invocation, browser);

  // A derived name contains no typo, so only a name given on the command line has to be confirmed with --create
  if (!isDirectory(profileDir) && !options.isCreate && invocation.origin !== 'derived') {
    const range = `--min ${MIN_DERIVED_PORT} --max ${MAX_DERIVED_PORT}`;
    assertProfileNotUnderived(
      invocation,
      // Name the package in a shell comment, which keeps the command pasteable, since thor-chrome does not install it
      `${output.name} --profile <repo>-<branch> --port "$(thor-git branch-number <branch> ${range})"  # thor-git is in @williamthorsen/git-tools`,
    );
    throw refuse(invocation, 'profile-missing', `profile '${profile}' does not exist at ${profileDir}`, {
      hints: [`Pass --create to make it, or list existing profiles: ${output.name} list`],
    });
  }

  const runningPid = assertPortAvailable(invocation, profile, profileDir, port);
  const label = composeInstanceLabel(profile, port);
  const commandLine = [
    browserApp,
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    ...PROMPT_SUPPRESSION_FLAGS,
    `--window-name=${label}`,
    ...options.urls,
  ];

  // Because the browser forwards a launch against a running profile to that instance and opens no window there, only
  // a launch that starts one opens the page. It comes after a tab of another kind, because Chromium reports tabs in
  // creation order and the Playwright MCP server works in the first one
  const pageFile = runningPid === undefined ? `${profileDir}/${INSTANCE_PAGE_FILE}` : undefined;
  if (pageFile !== undefined) {
    if (options.urls.length === 0) commandLine.push('about:blank');
    commandLine.push(`file://${pageFile}`);
  }

  // Because the endpoint alone cannot tell a slow start from a policy refusal, the browser's own output is kept for the
  // failure report to read back
  const logFile = resolveLogPath(invocation, profile);

  const session = readLaunchSession(invocation);
  const isOpenLaunch = session !== '' && session !== 'Aqua';
  let launchCommand = commandLine;
  if (isOpenLaunch) {
    const bundle = resolveAppBundle(invocation, browserApp, session);
    const openOptions = ['-n', '-a', bundle, '--stdout', logFile, '--stderr', logFile, '--args'];
    launchCommand = ['open', ...openOptions, ...commandLine.slice(1)];
  }

  if (options.isDryRun) {
    if (invocation.format === 'json') {
      writeJson(invocation, { command: launchCommand, dryRun: true });
    } else {
      writeProse(invocation, 'stdout', [formatCommandLine(launchCommand)]);
    }
    return 0;
  }

  const timeout = readTimeoutSeconds(invocation, 'THOR_CHROME_LAUNCH_TIMEOUT', DEFAULT_LAUNCH_TIMEOUT_SECONDS);

  // Write no record for an underived profile: The derivation that would say where it came from was lost
  fs.mkdirSync(profileDir, { recursive: true });
  if (invocation.origin !== 'underived') writeProfileRecord(invocation, profileDir);
  if (pageFile !== undefined) {
    writeInstancePage(invocation, { browser, browserApp, label, launchCommand, logFile, pageFile, port, profile });
  }

  startBrowser(invocation, launchCommand, logFile, isOpenLaunch ? session : undefined);
  if (!(await awaitDevtools(invocation, port, timeout.seconds))) {
    throw describeLaunchFailure(invocation, profile, port, logFile, timeout.text);
  }

  if (invocation.format === 'json') {
    const lookup = findBrowserPid(invocation, profileDir);
    const pid = lookup.isReadable ? lookup.pid : undefined;
    const rendered = renderProfile(invocation, { name: profile, path: profileDir, pid, port, state: 'debugging' });
    writeJson(invocation, { profile: rendered, browser });
    return 0;
  }
  writeProse(invocation, 'stdout', [
    `${browser}: profile '${profile}' on port ${port}`,
    `DevTools: http://127.0.0.1:${port}/json/version`,
  ]);
  return 0;
}

// region | Helpers

/**
 * Refuses unless the requested port is usable for the profile, which is the case when the profile already owns a live
 * endpoint on it (Chrome then forwards the URLs to that instance) or when nothing is listening. Returns the PID of the
 * profile's browser when one is running, which tells a fresh start from a launch that the browser will forward.
 *
 * The browser forwards a second launch against a live `--user-data-dir` to the running process and discards
 * `--remote-debugging-port`, producing a browser with no port and no error. State is therefore read from the profile's
 * browser process, whose argv contains the port that it actually owns, before the DevTools endpoint is probed: A probe
 * alone identifies some browser on the port, not this profile's.
 */
function assertPortAvailable(invocation: Invocation, profile: string, profileDir: string, port: string) {
  const { name } = invocation.output;
  const lookup = findBrowserPid(invocation, profileDir);
  if (!lookup.isReadable) {
    throw refuse(
      invocation,
      'process-list-unavailable',
      `could not read the process list, so the state of profile '${profile}' is unknown`,
      { hints: [PROCESS_LIST_RECOVERY_HINT] },
    );
  }

  const { pid } = lookup;
  if (pid !== undefined) {
    const runningPort = readDebuggingPort(invocation, pid);
    if (runningPort === undefined) {
      throw refuse(
        invocation,
        'profile-running-without-port',
        `profile '${profile}' is running (PID ${pid}) without a debugging port`,
        {
          hints: [
            'The browser discards --remote-debugging-port while an instance owns the profile.',
            `Quit it first: ${name} quit ${profile}`,
          ],
        },
      );
    }
    if (runningPort !== port) {
      throw refuse(
        invocation,
        'port-mismatch',
        `profile '${profile}' is already debugging on port ${runningPort}, not ${port}`,
        {
          hints: [`Attach there with --port ${runningPort}, or quit it: ${name} quit ${profile}`],
        },
      );
    }
    if (!probeDevtools(invocation, port)) {
      const logFile = resolveLogPath(invocation, profile);
      if (readFile(logFile).includes(POLICY_DENIAL_MESSAGE)) {
        throw refuse(
          invocation,
          'policy-denied',
          `profile '${profile}' is running (PID ${pid}) but policy blocked its debugging port`,
          {
            extra: { log: logFile },
            hints: [
              'Retrying cannot open it. Quit the instance and relaunch with --browser chrome-for-testing:',
              `  ${name} quit ${profile}`,
            ],
          },
        );
      }
      throw refuse(
        invocation,
        'endpoint-unresponsive',
        `profile '${profile}' declares port ${port} (PID ${pid}) but the endpoint is not answering`,
        { hints: [`The browser may still be starting. Retry, or quit it: ${name} quit ${profile}`] },
      );
    }
    return pid;
  }

  const listener = describePortListener(invocation, port);
  if (listener !== '') {
    throw refuse(invocation, 'port-busy', `port ${port} is held by ${listener}`, {
      extra: { listener },
      hints: ['Pick another port with --port, or stop the process that holds it.'],
    });
  }
  return;
}

/** Reports whether the DevTools endpoint answers within the launch budget. */
async function awaitDevtools(invocation: Invocation, port: string, timeoutSeconds: number): Promise<boolean> {
  const { deps } = invocation;
  const started = deps.now();
  while (!probeDevtools(invocation, port)) {
    if (deps.now() - started > timeoutSeconds * 1_000) return false;
    await deps.sleep(LAUNCH_POLL_INTERVAL_MILLISECONDS);
  }
  return true;
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
  if (readFile(logFile).includes(POLICY_DENIAL_MESSAGE)) {
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

/** Returns a file's content, or an empty string when it cannot be read. */
function readFile(file: string): string {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

/** Returns the path of the file that contains a profile's most recent launch output. */
function resolveLogPath(invocation: Invocation, profile: string): string {
  return `${invocation.deps.env['TMPDIR'] || '/tmp'}/thor-chrome-${profile}.log`;
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
