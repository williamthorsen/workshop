import fs from 'node:fs';

import { isDirectory } from '../shared/paths.ts';
import { type ProfileStateName, resolveProfileState } from './browser-process.ts';
import { INSTANCE_PAGE_FILE } from './instance-page.ts';
import { type Invocation, refuse, requireCommand, runTolerantly } from './invocation.ts';
import { assertProfileNotUnderived, assertStateKnown, resolveDefaultProfile } from './profiles.ts';
import { renderProfile, writeJson, writeProse } from './render.ts';

/**
 * Opens the named or derived profile's instance page in a new tab of its running browser, through the DevTools
 * endpoint, so that the page is reachable however the tab that the launch opened has been used since. Opens the page
 * that the launch wrote, which describes that launch, and never writes one.
 */
export function showInstancePage(invocation: Invocation, profile: string | undefined): number {
  const { name: command } = invocation.output;
  const { dir, name } = resolveDefaultProfile(invocation, profile ?? '');

  requireCommand(invocation, 'curl');
  requireCommand(invocation, 'pgrep');
  assertProfileNotUnderived(invocation, `${command} show-instance-page <repo>-<branch>`);
  if (!isDirectory(dir)) {
    throw refuse(invocation, 'profile-missing', `profile '${name}' does not exist at ${dir}`, {
      hints: [`List existing profiles: ${command} list`],
    });
  }

  const { pid, port, state } = resolveProfileState(invocation, dir);
  assertStateKnown(invocation, name, state);
  if (state !== 'debugging' || port === undefined) throw describeUnavailable(invocation, name, state, pid, port);

  const pageFile = `${dir}/${INSTANCE_PAGE_FILE}`;
  if (!fs.existsSync(pageFile)) {
    throw refuse(
      invocation,
      'instance-page-missing',
      `the instance page of profile '${name}' does not exist at ${pageFile}`,
      { hints: [`A launch that starts the browser writes it. Quit and launch again: ${command} quit ${name}`] },
    );
  }

  // Chrome refuses GET on /json/new, and reads the URL to open from the whole query string
  const endpoint = `http://127.0.0.1:${port}/json/new`;
  const url = `${endpoint}?${encodeURIComponent(`file://${pageFile}`)}`;
  const result = runTolerantly(invocation, 'curl', ['--silent', '--fail', '--max-time', '2', '--request', 'PUT', url]);
  if (result.status !== 0) {
    throw refuse(
      invocation,
      'instance-page-open-failed',
      `could not open the instance page of profile '${name}' through ${endpoint} (curl exit ${result.status})`,
      { hints: [`Check the browser's state: ${command} status ${name}`] },
    );
  }

  if (invocation.format === 'json') {
    writeJson(invocation, {
      profile: renderProfile(invocation, { name, path: dir, pid, port, state }),
      page: pageFile,
    });
    return 0;
  }
  writeProse(invocation, 'stdout', [`Opened the instance page of '${name}' on port ${port}.`]);
  return 0;
}

// region | Helpers

/** Returns the refusal of a profile whose browser is not serving a DevTools endpoint. */
function describeUnavailable(
  invocation: Invocation,
  profile: string,
  state: ProfileStateName,
  pid: string | undefined,
  port: string | undefined,
) {
  const { name } = invocation.output;
  if (state === 'stopped') {
    return refuse(invocation, 'profile-not-running', `profile '${profile}' is not running`, {
      hints: [`Launch it: ${name} --profile ${profile}`],
    });
  }
  if (state === 'running-without-port') {
    return refuse(
      invocation,
      'profile-running-without-port',
      `profile '${profile}' is running (PID ${pid ?? 'unknown'}) without a debugging port`,
      { hints: [`Quit it and launch again: ${name} quit ${profile}`] },
    );
  }
  return refuse(
    invocation,
    'endpoint-unresponsive',
    `profile '${profile}' declares port ${port ?? 'unknown'} (PID ${pid ?? 'unknown'}) but the endpoint is not answering`,
    { hints: [`The browser may still be starting. Retry, or quit it: ${name} quit ${profile}`] },
  );
}

// endregion | Helpers
