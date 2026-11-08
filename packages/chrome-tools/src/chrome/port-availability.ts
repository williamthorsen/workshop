import {
  describePortListener,
  findBrowserPid,
  findProcessProfile,
  probeDevtools,
  readDebuggingPort,
  readIsHeadless,
} from './browser-process.ts';
import { type Invocation, PROCESS_LIST_RECOVERY_HINT, refuse } from './invocation.ts';
import { POLICY_DENIAL_MESSAGE, readLogFile, resolveLogPath } from './launch-log.ts';

/**
 * Refuses unless the requested port is usable for the profile, which is the case when the profile already owns a live
 * endpoint on it in the requested mode, headless or windowed, or when nothing is listening. Returns the PID and the mode
 * of the profile's browser when one is running, which tells a fresh start from a launch that opens its pages there.
 *
 * The browser forwards a second launch against a live `--user-data-dir` to the running process and discards
 * `--remote-debugging-port`, producing a browser with no port and no error. State is therefore read from the profile's
 * browser process, whose argv contains the port that it actually owns, before the DevTools endpoint is probed: A probe
 * alone identifies some browser on the port, not this profile's.
 */
export function assertPortAvailable(
  invocation: Invocation,
  request: { isHeadless: boolean; port: string; profile: string; profileDir: string },
): { isHeadless: boolean; pid: string } | undefined {
  const { isHeadless, port, profile, profileDir } = request;
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
    const isRunningHeadless = readIsHeadless(invocation, pid);
    if (isRunningHeadless !== isHeadless) {
      const [running, requested] = isRunningHeadless ? ['headless', 'windowed'] : ['windowed', 'headless'];
      throw refuse(
        invocation,
        'mode-mismatch',
        `profile '${profile}' is running ${running} (PID ${pid}), so a ${requested} launch cannot use it`,
        { hints: [`Quit it first: ${name} quit ${profile}`] },
      );
    }
    if (!probeDevtools(invocation, port)) {
      const logFile = resolveLogPath(invocation, profile);
      if (readLogFile(logFile).includes(POLICY_DENIAL_MESSAGE)) {
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
    return { isHeadless: isRunningHeadless, pid };
  }

  const listener = describePortListener(invocation, port);
  if (listener !== undefined) {
    const holder = findProcessProfile(invocation, listener.pid);
    const { description } = listener;
    if (holder !== undefined) {
      throw refuse(invocation, 'port-busy', `port ${port} is held by profile '${holder}': ${description}`, {
        extra: { listener: description },
        hints: [`Pick another port with --port, or quit that profile: ${name} quit ${holder}`],
      });
    }
    throw refuse(invocation, 'port-busy', `port ${port} is held by ${description}`, {
      extra: { listener: description },
      hints: ['Pick another port with --port, or stop the process that holds it.'],
    });
  }
  return;
}
