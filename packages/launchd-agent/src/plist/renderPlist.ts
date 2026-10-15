/** What launchd needs to know to run an agent. */
export interface AgentSpec {
  /** Variables set in the agent's environment. A `PATH` entry replaces the default `PATH` entirely. */
  environment?: Readonly<Record<string, string>>;
  /** The launchd label, which also names the plist file and addresses the agent in launchctl. */
  label: string;
  /** Directory holding the agent's stdout and stderr logs. */
  logDir: string;
  /** The command that launchd runs, as absolute paths: launchd has no working directory or shell. */
  programArguments: readonly string[];
  trigger: AgentTrigger;
}

/**
 * When launchd starts the agent: every `startIntervalSec` seconds, skipping rather than queueing an interval
 * missed during sleep, or again whenever its process exits.
 */
export type AgentTrigger = { keepAlive: true } | { startIntervalSec: number };

/** What `renderPlist` takes from the machine rather than from the spec. */
export interface RenderPlistOptions {
  /** The Homebrew bin directory to put ahead of the system's on `PATH`, or `undefined` to leave it out. */
  homebrewBin?: string | undefined;
}

/** The `PATH` that launchd gives an agent whose plist sets none. */
const LAUNCHD_DEFAULT_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';

const PLIST_DOCTYPE =
  // eslint-disable-next-line unicorn/prefer-https -- the DOCTYPE is a fixed identifier that launchd never fetches.
  '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">';

/**
 * Renders the agent's launchd property list. Its `PATH` is the Homebrew bin, when one is given, followed by launchd's
 * default, because launchd supplies a minimal environment that does not name Homebrew.
 */
export function renderPlist(spec: AgentSpec, options: RenderPlistOptions = {}): string {
  const { label, logDir, programArguments, trigger } = spec;
  const argumentLines = programArguments.map((argument) => `    <string>${escapeXml(argument)}</string>`);

  return `<?xml version="1.0" encoding="UTF-8"?>
${PLIST_DOCTYPE}
<plist version="1.0">
<dict>
  <key>EnvironmentVariables</key>
  <dict>
${renderEnvironment(spec, options)}  </dict>
${renderKeepAlive(trigger)}  <key>Label</key>
  <string>${escapeXml(label)}</string>
  <key>ProgramArguments</key>
  <array>
${argumentLines.join('\n')}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardErrorPath</key>
  <string>${escapeXml(logDir)}/stderr.log</string>
  <key>StandardOutPath</key>
  <string>${escapeXml(logDir)}/stdout.log</string>
${renderInterval(trigger)}</dict>
</plist>
`;
}

// region | Helpers

/** Builds the default `PATH`: the Homebrew bin, when known, ahead of launchd's default. */
function buildDefaultPath(homebrewBin: string | undefined): string {
  return homebrewBin === undefined ? LAUNCHD_DEFAULT_PATH : `${homebrewBin}:${LAUNCHD_DEFAULT_PATH}`;
}

/** Escapes the three characters that would otherwise close a plist element or open an entity. */
function escapeXml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** Renders the `EnvironmentVariables` entries in key order, the default `PATH` among them unless the spec sets one. */
function renderEnvironment({ environment }: AgentSpec, { homebrewBin }: RenderPlistOptions): string {
  const variables = { PATH: buildDefaultPath(homebrewBin), ...environment };

  return Object.entries(variables)
    .toSorted(([left], [right]) => (left < right ? -1 : 1))
    .map(([key, value]) => `    <key>${escapeXml(key)}</key>\n    <string>${escapeXml(value)}</string>\n`)
    .join('');
}

/** Renders the `StartInterval` entry, which sorts after the log paths, for an interval trigger. */
function renderInterval(trigger: AgentTrigger): string {
  return 'startIntervalSec' in trigger
    ? `  <key>StartInterval</key>\n  <integer>${trigger.startIntervalSec}</integer>\n`
    : '';
}

/** Renders the `KeepAlive` entry, which sorts before the label, for a keep-alive trigger. */
function renderKeepAlive(trigger: AgentTrigger): string {
  return 'keepAlive' in trigger ? '  <key>KeepAlive</key>\n  <true/>\n' : '';
}

// endregion | Helpers
