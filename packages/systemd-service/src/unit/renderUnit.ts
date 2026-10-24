/** What systemd needs to know to run a service. */
export interface ServiceSpec {
  /** Units that the service starts after and pulls in, such as `docker.service`. */
  after?: readonly string[];
  /** Variables set in the service's environment, in addition to systemd's defaults. */
  environment?: Readonly<Record<string, string>>;
  /** Absolute directory holding the service's stdout and stderr logs. */
  logDir: string;
  /** The service's name, which names its unit `<name>.service` and addresses it in systemctl. */
  name: string;
  /** The command that systemd runs. Its first element, the program, must be an absolute path. */
  programArguments: readonly string[];
  /** When systemd starts the service. Without one, the service is kept alive. */
  trigger?: ServiceTrigger;
}

/**
 * When systemd starts the service: again 10 seconds after each exit, or through a timer at install, at each boot, and
 * every `startIntervalSec` seconds after the last start, skipping rather than queueing a start while a run continues.
 */
export type ServiceTrigger = { keepAlive: true } | { startIntervalSec: number };

/** Escapes `%`, which systemd otherwise reads as the start of a specifier. */
export function escapeSpecifiers(text: string): string {
  return text.replaceAll('%', '%%');
}

/** Reads the interval at which the service is scheduled, or `undefined` for a kept-alive service. */
export function readStartIntervalSec({ trigger }: ServiceSpec): number | undefined {
  return trigger !== undefined && 'startIntervalSec' in trigger ? trigger.startIntervalSec : undefined;
}

/**
 * Renders the service's systemd unit. A kept-alive service restarts 10 seconds after each exit and is enabled for
 * `multi-user.target`; a scheduled one is a oneshot that its timer starts, so it neither restarts nor is enabled itself.
 * `StartLimitIntervalSec=0` stops systemd from giving up on a service that keeps exiting.
 */
export function renderUnit(spec: ServiceSpec): string {
  const { after = [], logDir, name, programArguments } = spec;
  const isScheduled = readStartIntervalSec(spec) !== undefined;
  const dependencyLines = after.length === 0 ? '' : `After=${after.join(' ')}\nWants=${after.join(' ')}\n`;
  const escapedLogDir = escapeSpecifiers(logDir);
  const restartLines = isScheduled ? '' : 'Restart=always\nRestartSec=10\n';
  const installSection = isScheduled ? '' : '\n[Install]\nWantedBy=multi-user.target\n';

  return `[Unit]
Description=${escapeSpecifiers(name)}
${dependencyLines}StartLimitIntervalSec=0

[Service]
${isScheduled ? 'Type=oneshot\n' : ''}${renderEnvironment(spec)}ExecStart=${programArguments.map((argument) => quoteExecArgument(argument)).join(' ')}
${restartLines}StandardError=append:${escapedLogDir}/stderr.log
StandardOutput=append:${escapedLogDir}/stdout.log
${installSection}`;
}

// region | Helpers

/** Quotes a string for a unit setting, escaping the backslashes and double quotes that would end the quoted word. */
function quote(text: string): string {
  return `"${escapeSpecifiers(text.replaceAll('\\', '\\\\').replaceAll('"', String.raw`\"`))}"`;
}

/** Quotes an `ExecStart` argument, also escaping the `$` that systemd expands as an environment variable there. */
function quoteExecArgument(argument: string): string {
  return quote(argument.replaceAll('$', '$$$$'));
}

/** Renders one `Environment=` line per variable, in key order. */
function renderEnvironment({ environment = {} }: ServiceSpec): string {
  return Object.entries(environment)
    .toSorted(([left], [right]) => (left < right ? -1 : 1))
    .map(([key, value]) => `Environment=${quote(`${key}=${value}`)}\n`)
    .join('');
}

// endregion | Helpers
