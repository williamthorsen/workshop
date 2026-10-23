import { runSystemctl } from '../systemctl/runSystemctl.ts';
import { buildUnitName } from './service-targets.ts';

/**
 * What systemd holds for a service: nothing, or a loaded service with the pid of its process when one runs and the
 * exit code of its last run when it has exited.
 */
export type ServiceState =
  { loaded: false } | { lastExitCode: number | undefined; loaded: true; pid: number | undefined };

/** The `ExecMainCode` values, from `waitid`'s `si_code`, that report how the main process ended. */
const CLD_EXITED = '1';
const CLD_KILLED = '2';
const CLD_DUMPED = '3';

/** Reads whether systemd has the service loaded and, when it does, its running pid and last exit code. */
export async function readServiceState(name: string): Promise<ServiceState> {
  const { exitCode, output } = await runSystemctl([
    'show',
    buildUnitName(name),
    '--property=LoadState,MainPID,ExecMainCode,ExecMainStatus,ExecMainExitTimestampMonotonic',
  ]);
  if (exitCode !== 0) {
    throw new Error(`systemctl show failed: ${output.trim()}`);
  }

  const properties = parseProperties(output);
  if (properties.get('LoadState') !== 'loaded') return { loaded: false };

  const pid = Number(properties.get('MainPID') ?? '0');

  return { lastExitCode: readLastExitCode(properties), loaded: true, pid: pid === 0 ? undefined : pid };
}

// region | Helpers

/** Parses `systemctl show`'s `key=value` lines. */
function parseProperties(output: string): Map<string, string> {
  return new Map(
    output
      .split('\n')
      .filter((line) => line.includes('='))
      .map((line) => {
        const separatorIndex = line.indexOf('=');
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      }),
  );
}

/**
 * Reads the exit code of the main process's last run, or `undefined` when it has not exited. A process ended by a
 * signal reports 128 plus the signal number, as a shell does.
 */
function readLastExitCode(properties: Map<string, string>): number | undefined {
  const exitTimestamp = properties.get('ExecMainExitTimestampMonotonic');
  if (exitTimestamp === undefined || exitTimestamp === '0') return undefined;

  const status = Number(properties.get('ExecMainStatus') ?? '0');
  switch (properties.get('ExecMainCode')) {
    case CLD_EXITED:
      return status;
    case CLD_DUMPED:
    case CLD_KILLED:
      return 128 + status;
    default:
      return undefined;
  }
}

// endregion | Helpers
