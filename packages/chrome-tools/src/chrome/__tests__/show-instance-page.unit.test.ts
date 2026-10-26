import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { type FakeThorChrome, makeFakeThorChrome } from '../test-utils/fake-thor-chrome.ts';
import { runThorChrome } from '../thor-chrome.ts';

const DEBUGGING = {
  pgrep: { stdout: '4242\n' },
  'ps -o command= -p 4242': { stdout: 'chrome --remote-debugging-port=9333\n' },
};

describe('show-instance-page', () => {
  it("opens the instance page through the running browser's endpoint", async () => {
    const fake = makeFakeThorChrome({ results: DEBUGGING });
    const pageFile = writeInstancePage(fake, 'thrive');
    await expect(run(fake, ['show-instance-page', 'thrive'])).resolves.toBe(0);
    expect(fake.captured.stdout()).toBe("Opened the instance page of 'thrive' on port 9333.\n");
    expect(fake.calls).toContainEqual({
      args: [
        '--silent',
        '--fail',
        '--max-time',
        '2',
        '--request',
        'PUT',
        `http://127.0.0.1:9333/json/new?${encodeURIComponent(`file://${pageFile}`)}`,
      ],
      program: 'curl',
    });
  });

  it('reports the profile and the page under --json', async () => {
    const fake = makeFakeThorChrome({ results: DEBUGGING });
    const pageFile = writeInstancePage(fake, 'thrive');
    await expect(run(fake, ['show-instance-page', 'thrive', '--json'])).resolves.toBe(0);
    expect(fake.readReport()).toMatchObject({
      profile: { name: 'thrive', state: 'debugging', pid: 4_242, port: 9_333 },
      page: pageFile,
    });
  });

  it('acts on the profile derived from the working directory when none is named', async () => {
    const fake = makeFakeThorChrome({ results: DEBUGGING });
    writeInstancePage(fake, 'widget-321');
    await expect(run(fake, ['show-instance-page'])).resolves.toBe(0);
    expect(fake.captured.stdout()).toBe("Opened the instance page of 'widget-321' on port 9333.\n");
  });

  it.each([
    ['a stopped profile', {}, 'profile-not-running', 'Launch it: thor-chrome --profile thrive'],
    [
      'a profile running without a debugging port',
      { pgrep: { stdout: '4242\n' }, 'ps -o command= -p 4242': { stdout: 'chrome\n' } },
      'profile-running-without-port',
      'Quit it and launch again: thor-chrome quit thrive',
    ],
    [
      'a profile whose endpoint does not answer',
      { ...DEBUGGING, curl: { status: 7 } },
      'endpoint-unresponsive',
      'The browser may still be starting. Retry, or quit it: thor-chrome quit thrive',
    ],
    [
      'a profile whose state is unknown',
      { pgrep: { status: 3 } },
      'process-list-unavailable',
      'Run this command from a terminal outside the sandbox.',
    ],
  ])('refuses %s', async (_description, results, code, hint) => {
    const fake = makeFakeThorChrome({ results });
    writeInstancePage(fake, 'thrive');
    await expect(run(fake, ['show-instance-page', 'thrive', '--json'])).resolves.toBe(1);
    expect(fake.readReport()).toMatchObject({ error: { code } });

    const prose = makeFakeThorChrome({ results });
    writeInstancePage(prose, 'thrive');
    await run(prose, ['show-instance-page', 'thrive']);
    expect(prose.captured.stderr()).toContain(hint);
  });

  it('refuses a profile that does not exist with profile-missing, naming how to list profiles', async () => {
    const fake = makeFakeThorChrome({ results: DEBUGGING });
    await expect(run(fake, ['show-instance-page', 'thriv', '--json'])).resolves.toBe(1);
    expect(fake.readReport()).toMatchObject({ error: { code: 'profile-missing' } });

    const prose = makeFakeThorChrome({ results: DEBUGGING });
    await run(prose, ['show-instance-page', 'thriv']);
    expect(prose.captured.stderr()).toContain('List existing profiles: thor-chrome list');
  });

  it('refuses a profile without an instance page', async () => {
    const fake = makeFakeThorChrome({ results: DEBUGGING });
    fake.makeProfile('thrive');
    await expect(run(fake, ['show-instance-page', 'thrive', '--json'])).resolves.toBe(1);
    expect(fake.readReport()).toMatchObject({ error: { code: 'instance-page-missing' } });
    expect(fake.calls.some((call) => call.args.includes('PUT'))).toBe(false);
  });

  it('refuses when the endpoint does not open the page', async () => {
    const fake = makeFakeThorChrome({
      results: { ...DEBUGGING, 'curl --silent --fail --max-time 2 --request PUT': { status: 22 } },
    });
    writeInstancePage(fake, 'thrive');
    await expect(run(fake, ['show-instance-page', 'thrive'])).resolves.toBe(1);
    expect(fake.captured.stderr()).toContain(
      "thor-chrome: could not open the instance page of profile 'thrive' through http://127.0.0.1:9333/json/new (curl exit 22)\n",
    );
  });

  it('refuses outside a repository with underived-profile, naming the profile to pass', async () => {
    const fake = makeFakeThorChrome({ results: { 'git branch': { status: 128 }, 'git rev-parse': { status: 128 } } });
    await run(fake, ['show-instance-page']);
    expect(fake.captured.stderr()).toContain('    thor-chrome show-instance-page <repo>-<branch>\n');
  });

  it('refuses a second profile name and a --port option', async () => {
    const fake = makeFakeThorChrome();
    await expect(run(fake, ['show-instance-page', 'thrive', 'atlas'])).resolves.toBe(2);
    await expect(run(fake, ['show-instance-page', 'thrive', '--port', '9333'])).resolves.toBe(2);
    expect(fake.captured.stderr()).toContain("show-instance-page takes one profile name (got 'thrive' and 'atlas')");
    expect(fake.captured.stderr()).toContain('unknown option --port for show-instance-page');
  });
});

// region | Helpers

/** Runs thor-chrome against the fake. */
function run(fake: FakeThorChrome, args: string[]): Promise<number> {
  return runThorChrome(args, fake.captured.output, fake.deps);
}

/** Creates a profile containing an instance page, and returns the page's path. */
function writeInstancePage(fake: FakeThorChrome, profile: string): string {
  const pageFile = `${fake.makeProfile(profile)}/thor-chrome.html`;
  fs.writeFileSync(pageFile, '<title>page</title>\n');
  return pageFile;
}

// endregion | Helpers
