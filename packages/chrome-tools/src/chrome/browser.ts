import fs from 'node:fs';

import { quoteBashArgument } from '../portable/shell-quote.ts';
import { isExecutable } from '../shared/paths.ts';
import { type Invocation, refuse, runTolerantly, USAGE_CODE } from './invocation.ts';

/** The browsers that `--browser` and `THOR_CHROME_BROWSER` name. */
const BROWSER_NAMES = ['chrome', 'chrome-for-testing'] as const;

export type BrowserName = (typeof BROWSER_NAMES)[number];

export const DEFAULT_BROWSER: BrowserName = 'chrome';

/**
 * The recoveries named by every session-unavailable refusal: the shell from which the launch works, which the message
 * names so that a `--json` caller reads it too, and the restart that moves a tmux server into that session.
 */
export const SESSION_RECOVERY = 'launch from a terminal in the GUI login session instead';
export const SESSION_RECOVERY_HINT =
  'Or restart the tmux server from a terminal in the GUI login session: tmux kill-server, then tmux';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME_FOR_TESTING_EXECUTABLE = 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

/**
 * Returns the newest Chrome for Testing executable that Playwright has installed, or `undefined` when none is
 * installed. Because the revision directory changes with every Playwright upgrade, the highest revision is resolved
 * rather than recorded.
 */
export function findChromeForTesting(invocation: Invocation): string | undefined {
  const { env } = invocation.deps;
  const browsersDir = env['PLAYWRIGHT_BROWSERS_PATH'] || `${env['HOME'] ?? ''}/Library/Caches/ms-playwright`;
  let best: string | undefined;
  let bestRevision = -1;
  for (const entry of readDirectory(browsersDir)) {
    const revision = /^chromium-(\d+)$/.exec(entry)?.[1];
    if (revision === undefined || Number(revision) <= bestRevision) continue;
    for (const platformDir of readDirectory(`${browsersDir}/${entry}`)) {
      if (!platformDir.startsWith('chrome-mac')) continue;
      const candidate = `${browsersDir}/${entry}/${platformDir}/${CHROME_FOR_TESTING_EXECUTABLE}`;
      if (!isExecutable(candidate)) continue;
      best = candidate;
      bestRevision = Number(revision);
    }
  }
  return best;
}

/** Returns the shell's launchd session type, as `launchctl managername` reports it, or an empty string. */
export function readLaunchSession(invocation: Invocation): string {
  return runTolerantly(invocation, 'launchctl', ['managername']).stdout.replace(/\n+$/, '');
}

/**
 * Returns the app bundle containing a browser executable, which `open` launches in place of the executable. Refuses
 * an executable outside a bundle, and an unsigned bundle, since a Chromium build that LaunchServices starts from an
 * unsigned bundle crashes on startup.
 */
export function resolveAppBundle(invocation: Invocation, app: string, session: string): string {
  const marker = '/Contents/MacOS/';
  if (!app.includes(marker)) {
    throw refuse(
      invocation,
      'session-unavailable',
      `${app} is not inside an app bundle, which open needs outside the GUI login session (launchctl managername: ${session}); ${SESSION_RECOVERY}`,
      { hints: ['Point THOR_CHROME_APP at the executable inside an .app bundle.', SESSION_RECOVERY_HINT] },
    );
  }
  const bundle = app.slice(0, app.indexOf(marker));
  if (runTolerantly(invocation, 'codesign', ['--display', bundle]).status !== 0) {
    throw refuse(
      invocation,
      'session-unavailable',
      `${bundle} is not code-signed, so open cannot launch it outside the GUI login session (launchctl managername: ${session}); ${SESSION_RECOVERY}`,
      {
        hints: [
          SESSION_RECOVERY_HINT,
          `Or sign the bundle ad hoc, which open accepts: codesign --force --deep --sign - ${quoteBashArgument(bundle)}`,
        ],
      },
    );
  }
  return bundle;
}

/**
 * Returns the executable for a browser name, refusing one whose executable is absent.
 * `THOR_CHROME_APP` replaces the path for `chrome` only, leaving the resolved builds addressable by name.
 */
export function resolveBrowserApp(invocation: Invocation, browser: BrowserName): string {
  let app: string | undefined;
  let hint: string;
  if (browser === 'chrome') {
    app = invocation.deps.env['THOR_CHROME_APP'] || CHROME_PATH;
    hint = 'override with THOR_CHROME_APP';
  } else {
    app = findChromeForTesting(invocation);
    hint = 'install it with: npx playwright install chromium';
  }
  if (app === undefined || app === '' || !isExecutable(app)) {
    const location = app === undefined || app === '' ? '' : ` at ${app}`;
    throw refuse(invocation, 'browser-not-found', `${browser} not found${location} (${hint})`, { status: 127 });
  }
  return app;
}

/**
 * Returns the browser to launch: the `--browser` value, else a non-empty `THOR_CHROME_BROWSER`, else the default.
 * Refuses an unknown name, naming the variable when the name came from it.
 */
export function resolveBrowserName(invocation: Invocation, flag: string | undefined): BrowserName {
  const variable = invocation.deps.env['THOR_CHROME_BROWSER'] ?? '';
  const value = flag ?? (variable || DEFAULT_BROWSER);
  const browser = BROWSER_NAMES.find((name) => name === value);
  if (browser === undefined) {
    const source = flag === undefined ? ' in THOR_CHROME_BROWSER' : '';
    throw refuse(invocation, USAGE_CODE, `unknown browser '${value}'${source} (${BROWSER_NAMES.join(', ')})`);
  }
  return browser;
}

// region | Helpers

/** Returns a directory's entries, or none when it cannot be read. */
function readDirectory(directory: string): string[] {
  try {
    return fs.readdirSync(directory).toSorted();
  } catch {
    return [];
  }
}

// endregion | Helpers
