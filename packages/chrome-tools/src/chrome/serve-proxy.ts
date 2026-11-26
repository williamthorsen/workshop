import { probeDevtools } from './browser-process.ts';
import { readDevtoolsActivePort } from './devtools-active-port.ts';
import { type Invocation, refuse } from './invocation.ts';
import { resolveProxyLogPath } from './launch-log.ts';
import { readLaunchTimeout } from './timeouts.ts';

/** The options of `serve-proxy`, as parsed from its command line. */
export interface ServeProxyOptions {
  browserPid: string;
  port: string;
  profileDir: string;
}

/** The verb that serves a profile's advertised port, which `launch` starts and which is not meant to be run by hand. */
export const SERVE_PROXY_VERB = 'serve-proxy';

const BROWSER_POLL_INTERVAL_MILLISECONDS = 1000;
const PORT_FILE_POLL_INTERVAL_MILLISECONDS = 200;

/**
 * Serves the advertised port through the DevTools proxy until the browser exits or this process is asked to terminate,
 * and returns the exit status. The browser's own port is read from its `DevToolsActivePort`, which it writes once its
 * endpoint listens, so the verb waits for that file within the launch budget.
 */
export async function runServeProxy(invocation: Invocation, options: ServeProxyOptions): Promise<number> {
  const { deps } = invocation;
  const upstreamPort = await awaitUpstreamPort(invocation, options.profileDir);
  const proxy = await listen(invocation, options.port, upstreamPort);

  const termination = { isRequested: false };
  const stopListening = deps.onTerminate(() => {
    termination.isRequested = true;
    void proxy.close();
  });
  try {
    while (!termination.isRequested && deps.isProcessAlive(Number(options.browserPid))) {
      await deps.sleep(BROWSER_POLL_INTERVAL_MILLISECONDS);
    }
  } finally {
    stopListening();
    await proxy.close();
  }
  return 0;
}

/**
 * Starts a profile's DevTools proxy as a detached `serve-proxy` process of this same program, logging beside the
 * launch log. The argv names the profile directory as `--profile-dir`, never as `user-data-dir=`, which would make the
 * proxy match the browser search of `findBrowserPid`.
 */
export function startProxy(
  invocation: Invocation,
  request: { browserPid: string; port: string; profile: string; profileDir: string },
): string {
  const { browserPid, port, profile, profileDir } = request;
  const logPath = resolveProxyLogPath(invocation, profile);
  const args = [
    invocation.deps.entryScript,
    SERVE_PROXY_VERB,
    '--port',
    port,
    '--profile-dir',
    profileDir,
    '--browser-pid',
    browserPid,
  ];
  invocation.deps.spawnDetached(process.execPath, args, { logPath });
  return logPath;
}

// region | Helpers

/**
 * Returns the browser's own port once its `DevToolsActivePort` names one that answers, refusing when the launch
 * budget runs out first.
 */
async function awaitUpstreamPort(invocation: Invocation, profileDir: string): Promise<string> {
  const { deps } = invocation;
  const timeout = readLaunchTimeout(invocation);
  const startedMilliseconds = deps.now();
  for (;;) {
    const upstreamPort = readDevtoolsActivePort(profileDir);
    if (upstreamPort !== undefined && probeDevtools(invocation, upstreamPort)) return upstreamPort;
    if (deps.now() - startedMilliseconds > timeout.seconds * 1000) {
      if (upstreamPort === undefined) {
        throw refuse(
          invocation,
          'devtools-port-unknown',
          `the browser recorded no DevTools port in ${profileDir}/DevToolsActivePort after ${timeout.text}s`,
          { hints: ['The browser may have failed to start; read its launch log.'] },
        );
      }
      throw refuse(
        invocation,
        'endpoint-unresponsive',
        `the browser recorded port ${upstreamPort}, but nothing answers there after ${timeout.text}s`,
      );
    }
    await deps.sleep(PORT_FILE_POLL_INTERVAL_MILLISECONDS);
  }
}

/** Starts the proxy on the advertised port, refusing with `port-busy` when another process holds it. */
async function listen(invocation: Invocation, port: string, upstreamPort: string) {
  try {
    return await invocation.deps.startCdpProxy({ listenPort: port, upstreamPort });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EADDRINUSE') {
      throw refuse(invocation, 'port-busy', `port ${port} is held by another process`);
    }
    throw error;
  }
}

// endregion | Helpers
