import { homedir } from 'node:os';
import path from 'node:path';

/** Builds the launchd domain that holds per-user agents, which is `gui` over the current uid. */
export function buildDomainTarget(): string {
  return `gui/${process.getuid?.() ?? ''}`;
}

/** Builds the service target that launchctl subcommands address an agent by: its domain over its label. */
export function buildServiceTarget(label: string): string {
  return `${buildDomainTarget()}/${label}`;
}

/** Locates the directory that launchd reads user agents from. */
export function findAgentsDir(): string {
  return path.join(homedir(), 'Library/LaunchAgents');
}

/** Locates an agent's plist: the label as a filename, in launchd's user-agent directory. */
export function findPlistPath(label: string): string {
  return path.join(findAgentsDir(), `${label}.plist`);
}
