import { runChezmoiCaptured } from './runChezmoi.ts';

/** Minimum chezmoi version whose `status`-column semantics overlay relies on. */
export const MIN_CHEZMOI_VERSION = '2.46.0';

interface SemverParts {
  major: number;
  minor: number;
  patch: number;
}

/**
 * Verify chezmoi is installed and meets `MIN_CHEZMOI_VERSION`.
 *
 * Throws an actionable error (which the caller maps to exit 2) when chezmoi is
 * absent, its version cannot be parsed, or it is below the minimum.
 */
export async function assertChezmoiVersion(): Promise<void> {
  const { stdout, code } = await runChezmoiCaptured({ source: '.', target: '.' }, ['--version']);
  if (code !== 0) {
    throw new Error('chezmoi is not available — install it (e.g. `brew install chezmoi`)');
  }
  const installed = parseVersion(stdout);
  if (installed === undefined) {
    throw new Error(`could not determine chezmoi version from: ${stdout.trim()}`);
  }
  const minimum = parseVersion(MIN_CHEZMOI_VERSION);
  if (minimum === undefined || compareVersions(installed, minimum) < 0) {
    throw new Error(`chezmoi ${MIN_CHEZMOI_VERSION} or later is required; found ${formatVersion(installed)}`);
  }
}

/** Extract the first `major.minor.patch` triple from chezmoi's version string. */
export function parseVersion(text: string): SemverParts | undefined {
  const match = text.match(/(\d+)\.(\d+)\.(\d+)/);
  if (match === null) return undefined;
  const [, major, minor, patch] = match;
  if (major === undefined || minor === undefined || patch === undefined) return undefined;
  return { major: Number(major), minor: Number(minor), patch: Number(patch) };
}

function compareVersions(a: SemverParts, b: SemverParts): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function formatVersion(parts: SemverParts): string {
  return `${parts.major}.${parts.minor}.${parts.patch}`;
}
