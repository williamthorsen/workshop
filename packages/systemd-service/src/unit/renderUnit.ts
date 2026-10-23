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
}

/**
 * Renders the service's systemd unit. The service restarts 10 seconds after each exit, and `StartLimitIntervalSec=0`
 * stops systemd from giving up on a service that keeps exiting.
 */
export function renderUnit(spec: ServiceSpec): string {
  const { after = [], logDir, name, programArguments } = spec;
  const dependencyLines = after.length === 0 ? '' : `After=${after.join(' ')}\nWants=${after.join(' ')}\n`;
  const escapedLogDir = escapeSpecifiers(logDir);

  return `[Unit]
Description=${escapeSpecifiers(name)}
${dependencyLines}StartLimitIntervalSec=0

[Service]
${renderEnvironment(spec)}ExecStart=${programArguments.map((argument) => quoteExecArgument(argument)).join(' ')}
Restart=always
RestartSec=10
StandardError=append:${escapedLogDir}/stderr.log
StandardOutput=append:${escapedLogDir}/stdout.log

[Install]
WantedBy=multi-user.target
`;
}

// region | Helpers

/** Escapes `%`, which systemd otherwise reads as the start of a specifier. */
function escapeSpecifiers(text: string): string {
  return text.replaceAll('%', '%%');
}

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
