import { DEFAULT_BROWSER } from './browser.ts';
import { DEFAULT_LAUNCH_TIMEOUT_SECONDS } from './launch.ts';
import { DEFAULT_PORT, MAX_DERIVED_PORT, MIN_DERIVED_PORT } from './ports.ts';
import { DEFAULT_PROFILE } from './profiles.ts';
import { DEFAULT_QUIT_TIMEOUT_SECONDS } from './quit.ts';

/** Returns the help text, naming the command as it was invoked and the profiles directory as it resolves. */
export function formatUsage(name: string, profilesDir: string): string {
  return `Launch a Chrome-family browser with remote debugging against a named profile.

Usage:
  ${name} [launch] [--profile <name>] [--port <n>] [--browser <name>] [--create] [--dry-run] [--json] [URL...]
  ${name} list [--stale] [--json]
  ${name} status [<profile>] [--port <n>] [--json]
  ${name} quit [<profile>...] [--all|--idle <duration>] [--json]
  ${name} delete [<profile>...] [--stale|--all|--derived] [--force] [--dry-run] [--json]
  ${name} show-instance-page [<profile>] [--json]
  ${name} --help

Commands:
  launch          Launch the browser against the profile, or report the
                  command that would. The default when no command is named;
                  name it to launch a URL that spells a command
  list            Report each profile's running and debugging state and when
                  it was last used, marking a profile whose branch or
                  repository is gone as stale and one with no provenance record
                  as unrecorded
  status          Report the profile's state and the endpoint at which its
                  browser is or would be served: the running browser's port,
                  else the port that a launch would use. Starts and writes
                  nothing, and reports a profile that does not exist as stopped
  quit            Terminate each named profile's browser instance
  delete          Remove each named profile's directory, refusing while its
                  browser is running
  show-instance-page
                  Open the profile's instance page in a new tab of its running
                  browser, refusing a profile that is not debugging

  status, show-instance-page, quit, and delete act on the profile derived from
  the working directory when none is named. quit and delete process every
  name, refusing each profile that they cannot act on and exiting 1 if they
  refused any.

Arguments:
  URL             Page to open. A launch that starts a browser opens the
                  instance page after the URLs, or after a blank tab when none
                  is given, so that a client attaching to the first tab leaves
                  the instance page alone.
  <profile>       Profile directory under ${profilesDir}

Options:
  launch:
      --profile   Profile to launch (default: $THOR_CHROME_PROFILE, else the
                  working directory's repository and branch, as in
                  'macos-321'; '${DEFAULT_PROFILE}' with no branch. A launch
                  without --create, and quit and delete, refuse that fallback
                  when the profile does not exist, naming the profile to pass)
      --port      Remote-debugging port (default: derived from the working
                  directory's branch within ${MIN_DERIVED_PORT}-${MAX_DERIVED_PORT}, so
                  branch '321' debugs on 9321; ${DEFAULT_PORT} with no branch)
      --browser   Browser to launch: 'chrome', or 'chrome-for-testing' for the
                  build that Playwright installs, which Chrome's managed
                  preferences do not govern (default: $THOR_CHROME_BROWSER,
                  else '${DEFAULT_BROWSER}')
      --create    Permit creating a profile that does not exist yet
      --dry-run   Print the resolved launch command without running it
  list:
      --stale     List only the profiles that delete --stale would select
  status:
      --port      The port that a launch would use, as for launch
  quit:
      --all       Quit every running profile
      --idle      Quit every running browser to which no DevTools client has
                  been connected for the duration: a whole number and s, m, h,
                  or d, as in 2h. The idle time counts from the first run that
                  found the browser without a client, which the run records in
                  .thor-chrome.idle in the profiles directory, so a run quits
                  only what an earlier run already found idle. A browser whose
                  clients cannot be read, or that has no debugging port, is
                  left running. Every profile is kept
  delete:
      --stale     Select every profile derived from a branch that no longer
                  exists. A named profile, and one with no record of where it
                  came from, are never selected
      --all       Select every profile, including a named one
      --derived   Select the profile derived from the working directory's
                  repository and branch, ignoring THOR_CHROME_PROFILE, and
                  refuse it with profile-not-derived unless it recorded that
                  derivation. A worktree without a profile exits 0. A
                  worktree's pre-remove hook can run it with --force to
                  delete the profile along with the worktree
      --force     Quit a running profile's browser and wait for it to exit,
                  then remove the profile, rather than refusing it or, in a
                  sweep, retaining it
      --dry-run   Report what would be quit and removed, doing neither
  Every command:
      --json      Report as one JSON document on stdout, refusals included
  -h, --help      Show this help

An unknown command exits 2, as does any other usage error, such as an option
that the command does not take.

Startup prompts:
  Every launch suppresses the first-run flow, the default-browser offer, the
  search-engine choice screen, and the restore-pages bubble that follows an
  unclean shutdown.

Window identity:
  Every launch passes --window-name '<profile> · :<port>', which the Window
  menu, Mission Control, the Dock's window list, and tab search show. A launch
  that starts a browser also writes thor-chrome.html into the profile
  directory and opens it as the last tab, after a blank tab when no URL is
  given: the same label as its title, with the port, the DevTools endpoint,
  the browser, where the profile came from, when it was created and launched,
  the launch command, and the commands that quit and delete the profile. A
  launch forwarded to a running instance opens no page, so each window has
  one; show-instance-page opens it again in a new tab.

Launch session:
  A shell outside the GUI login session (launchctl managername other than
  Aqua) launches through 'open -n', so that the browser has a Dock icon and
  takes keyboard input; the dry run and the instance page show that form.
  There a launch is refused with session-unavailable when open is refused, or
  when the browser is not a code-signed app bundle, as Playwright's Chrome for
  Testing is not on an Intel Mac. Launch from a terminal in the GUI login
  session instead, restart the tmux server from one, or sign the bundle ad hoc:
  codesign --force --deep --sign - <bundle>, again after each Playwright
  install.

JSON output:
  --json replaces every report and every refusal with one document on stdout,
  leaving stderr empty and the exit code unchanged. --help is the exception: It
  prints this text whatever the flag says.

  A report is {"profiles":[...]} for list, quit, and delete,
  {"profile":{...},"browser":"..."} for a launch, and
  {"profile":{...},"endpoint":"http://127.0.0.1:<port>"} for status, and
  {"profile":{...},"page":"<path>"} for show-instance-page. A dry
  run adds "dryRun":true, and a launch dry run reports {"command":[...]} in
  place of the profile. A refusal of the whole invocation is
  {"error":{"code":...,"message":...}}, with the profile beside it whenever one
  was resolved. Three codes add a field to the error: "listener" on port-busy,
  "log" on policy-denied and launch-timeout. A refusal of one profile named to
  quit or delete is an "error" object of the same shape on that profile's
  entry, beside the entries of the profiles that were acted on.

  Every profile object contains "origin" ("derived", "named", or null when the
  profile records neither), the "repo" and "branch" from which a derived profile
  came, whether it is "stale", and the "lastUsedAt" instant. A profile recording
  no origin is never stale: null there means unknown, not false. A profile kept
  by a sweep adds "retained", naming why; the only reason is "running". A
  profile that delete --force quit, or would quit, reports the "pid" and "port"
  of that browser.

  Profile states:
    debugging, deleted, running-without-port, stopped, unknown, unresponsive

  A profile is unknown when the process list cannot be read, as under a
  sandbox; list and status report it, and every command that would act on
  the profile refuses with process-list-unavailable.

  Error codes:
    browser-not-found, endpoint-unresponsive, instance-page-missing,
    instance-page-open-failed, invalid-port, invalid-profile-name,
    invalid-timeout, launch-timeout, missing-command, policy-denied, port-busy,
    port-mismatch, process-list-unavailable, profile-missing,
    profile-not-derived, profile-not-running, profile-running,
    profile-running-without-port, quit-failed, quit-timeout,
    session-unavailable, underived-profile, usage

Environment:
  THOR_CHROME_PROFILE         Default profile when none is named
  THOR_CHROME_APP             Chrome executable, for Canary or Chromium
  THOR_CHROME_BROWSER         Default browser when --browser is not passed
  THOR_CHROME_QUIT_TIMEOUT    Seconds quit and delete --force wait for the browser to exit (default: ${DEFAULT_QUIT_TIMEOUT_SECONDS})
  THOR_CHROME_LAUNCH_TIMEOUT  Seconds a launch waits for the endpoint (default: ${DEFAULT_LAUNCH_TIMEOUT_SECONDS})
  THOR_CHROME_OUTPUT_STYLE    Output style of list: auto, plain, or rich (default: auto)
  XDG_DATA_HOME               Directory under which thor-chrome/profiles is kept (default: ~/.local/share)
  PLAYWRIGHT_BROWSERS_PATH    Where 'chrome-for-testing' is resolved from

Dependencies:
  curl            Probes the DevTools endpoint, and opens the instance page
                  through it
  pgrep, ps       Identify a profile's browser process and its port
  lsof            Names the process holding a busy port, and finds the
                  clients connected to a browser for quit --idle
  git             Reads the working directory's repository and branch, and
                  checks whether the branch recorded by a profile still exists
  launchctl       Names the shell's launchd session
  open, codesign  Launch the browser in the GUI login session from a shell
                  outside it, and check that its bundle is signed

Examples:
  ${name} http://localhost:4798
  ${name} --profile thrive http://localhost:4798
  ${name} --profile thrive --browser chrome-for-testing http://localhost:4798
  ${name} list
  ${name} list --stale
  ${name} status --json
  ${name} --profile scratch --create
  ${name} show-instance-page
  ${name} quit thrive
  ${name} quit --all
  ${name} quit --idle 2h
  ${name} delete thrive
  ${name} delete --stale --force --dry-run
  ${name} delete --derived --force
  ${name} delete --all
`;
}
