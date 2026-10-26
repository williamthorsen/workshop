import fs from 'node:fs';

import { formatIsoTimestamp } from '../portable/date-formats.ts';
import type { Invocation } from './invocation.ts';
import { formatCommandLine } from './render.ts';

/**
 * The page that a fresh launch writes and opens as its last tab, naming the instance and how to reach it. It lives
 * inside the profile for the same reason that the record does.
 */
export const INSTANCE_PAGE_FILE = 'thor-chrome.html';

/** What the instance page reports about a launch. */
export interface InstancePageFacts {
  browser: string;
  browserApp: string;
  label: string;
  launchCommand: readonly string[];
  logFile: string;
  pageFile: string;
  port: string;
  profile: string;
}

/**
 * Returns the label that names a launched instance: the profile and the port, as in `macos-321 · :9321`. The window
 * name and the instance page's title both render it, so a window is called the same thing wherever it is listed.
 */
export function composeInstanceLabel(profile: string, port: string): string {
  return `${profile} · :${port}`;
}

/** Returns a string escaped for HTML text and attribute values. */
export function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

/**
 * Writes the instance page: the label as its title, the facts that identify the instance, the command line that
 * started it, and the commands that reach it. Every value is escaped, since a URL or a path is the caller's text.
 */
export function writeInstancePage(invocation: Invocation, facts: InstancePageFacts): void {
  const { name } = invocation.output;
  const { branch, repo, repoDir } = invocation.work;
  const profileDir = facts.pageFile.slice(0, facts.pageFile.lastIndexOf('/'));
  const devtools = `http://127.0.0.1:${facts.port}/json/version`;
  const createdAt = readBirthTime(profileDir);
  const launchedAt = formatIsoTimestamp(Math.floor(invocation.deps.now() / 1_000));
  const origin = describeOrigin(invocation.origin, { branch, repo, repoDir });

  const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(facts.label)}</title>
<style>
body { font: 15px/1.5 -apple-system, system-ui, sans-serif; margin: 2rem auto; max-width: 48rem; padding: 0 1rem; }
dt { font-weight: 600; margin-top: 0.75rem; }
dd { margin: 0; }
code, pre { font: 13px/1.5 ui-monospace, Menlo, monospace; }
pre { overflow-x: auto; }
</style>
</head>
<body>
<h1>${escapeHtml(facts.label)}</h1>
<p>Launched by <code>${escapeHtml(name)}</code>.</p>
<dl>
<dt>Profile</dt><dd><code>${escapeHtml(facts.profile)}</code></dd>
<dt>Port</dt><dd><code>${escapeHtml(facts.port)}</code></dd>
<dt>DevTools</dt><dd><a href="${escapeHtml(devtools)}">${escapeHtml(devtools)}</a></dd>
<dt>Browser</dt><dd>${escapeHtml(facts.browser)} at <code>${escapeHtml(facts.browserApp)}</code></dd>
<dt>Profile directory</dt><dd><code>${escapeHtml(profileDir)}</code></dd>
<dt>Origin</dt><dd>${origin}</dd>
<dt>Profile created</dt><dd>${escapeHtml(createdAt === undefined ? 'unknown' : formatIsoTimestamp(createdAt))}</dd>
<dt>Launched at</dt><dd>${escapeHtml(launchedAt)}</dd>
<dt>Launch log</dt><dd><code>${escapeHtml(facts.logFile)}</code></dd>
</dl>
<h2>Launch command</h2>
<pre>${escapeHtml(formatCommandLine(facts.launchCommand))}</pre>
<h2>Commands</h2>
<pre>curl ${escapeHtml(devtools)}
${escapeHtml(name)} quit ${escapeHtml(facts.profile)}
${escapeHtml(name)} delete ${escapeHtml(facts.profile)}</pre>
</body>
</html>
`;
  fs.writeFileSync(facts.pageFile, page);
}

// region | Helpers

/** Returns the page's account of where the profile came from, as HTML. */
function describeOrigin(
  origin: Invocation['origin'],
  work: { branch: string | undefined; repo: string | undefined; repoDir: string | undefined },
): string {
  if (origin === 'named') return 'named by the caller, with <code>--profile</code> or <code>THOR_CHROME_PROFILE</code>';
  if (origin === 'underived') return 'none: no repository or branch resolved from the working directory';
  const branch = escapeHtml(work.branch ?? '');
  const repo = escapeHtml(work.repo ?? '');
  return `derived from branch <code>${branch}</code> of <code>${repo}</code> at <code>${escapeHtml(work.repoDir ?? '')}</code>`;
}

/** Returns a path's creation time in epoch seconds, or `undefined` when its filesystem records none. */
function readBirthTime(value: string): number | undefined {
  try {
    const birthTime = Math.floor(fs.statSync(value).birthtimeMs / 1_000);
    return birthTime > 0 ? birthTime : undefined;
  } catch {
    return undefined;
  }
}

// endregion | Helpers
