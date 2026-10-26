import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { type FakeThorChrome, makeFakeThorChrome } from '../test-utils/fake-thor-chrome.ts';
import { runThorChrome } from '../thor-chrome.ts';

describe('status', () => {
  it('reports the derived endpoint of a profile that has never been launched, creating nothing', async () => {
    const fake = makeFakeThorChrome();
    await expect(run(fake, ['status', '--json'])).resolves.toBe(0);
    expect(fake.captured.stdout()).toBe(
      `{"profile":{"name":"widget-321","path":"${fake.profilesDir}/widget-321","state":"stopped","pid":null,"port":null,` +
        '"devtools":null,"origin":null,"repo":null,"branch":null,"stale":null,"lastUsedAt":null},' +
        '"endpoint":"http://127.0.0.1:9321"}\n',
    );
    expect(fs.existsSync(`${fake.profilesDir}/widget-321`)).toBe(false);
  });

  it("reports the running browser's port in place of the derived one", async () => {
    const fake = makeFakeThorChrome({
      results: {
        pgrep: { stdout: '4242\n' },
        'ps -o command= -p 4242': { stdout: 'chrome --remote-debugging-port=9333\n' },
      },
    });
    fake.makeProfile('thrive');
    await expect(run(fake, ['status', 'thrive'])).resolves.toBe(0);
    expect(fake.captured.stdout()).toBe('thrive: debugging, endpoint http://127.0.0.1:9333\n');
  });

  it.each([
    [
      'the declared port of a browser whose endpoint does not answer',
      'chrome --remote-debugging-port=9333',
      'unresponsive',
      'http://127.0.0.1:9333',
    ],
    ['the derived port for a browser running without one', 'chrome', 'running-without-port', 'http://127.0.0.1:9321'],
  ])('reports %s', async (_description, command, state, endpoint) => {
    const fake = makeFakeThorChrome({
      results: {
        pgrep: { stdout: '4242\n' },
        'ps -o command= -p 4242': { stdout: `${command}\n` },
        curl: { status: 7 },
      },
    });
    fake.makeProfile('thrive');
    await expect(run(fake, ['status', 'thrive', '--json'])).resolves.toBe(0);
    expect(fake.readReport()).toMatchObject({ profile: { state }, endpoint });
  });

  it('writes nothing into an existing profile', async () => {
    const fake = makeFakeThorChrome();
    const dir = fake.makeProfile('thrive');
    await expect(run(fake, ['status', 'thrive'])).resolves.toBe(0);
    expect(fs.readdirSync(dir)).toStrictEqual([]);
  });

  it('prefers --port over the derived port', async () => {
    const fake = makeFakeThorChrome();
    await expect(run(fake, ['status', 'thrive', '--port', '9444'])).resolves.toBe(0);
    expect(fake.captured.stdout()).toBe('thrive: stopped, endpoint http://127.0.0.1:9444\n');
  });

  it('reports an unknown state and names the cause', async () => {
    const fake = makeFakeThorChrome({ results: { pgrep: { status: 3 } } });
    await expect(run(fake, ['status', 'thrive'])).resolves.toBe(0);
    expect(fake.captured.stdout()).toBe('thrive: unknown, endpoint http://127.0.0.1:9321\n');
    expect(fake.captured.stderr()).toContain('  Run thor-chrome status from a terminal outside the sandbox.\n');
  });

  it('reports an unknown state with the derived endpoint under --json, leaving stderr empty', async () => {
    const fake = makeFakeThorChrome({ results: { pgrep: { status: 3 } } });
    fake.makeProfile('thrive');
    await expect(run(fake, ['status', 'thrive', '--json'])).resolves.toBe(0);
    expect(fake.readReport()).toMatchObject({
      profile: { name: 'thrive', state: 'unknown', pid: null, port: null, devtools: null },
      endpoint: 'http://127.0.0.1:9321',
    });
    expect(fake.captured.stderr()).toBe('');
  });

  it('refuses outside a repository with underived-profile, naming the profile to pass', async () => {
    const fake = makeFakeThorChrome({ results: { 'git branch': { status: 128 }, 'git rev-parse': { status: 128 } } });
    await expect(run(fake, ['status', '--json'])).resolves.toBe(1);
    expect(fake.readReport()).toMatchObject({ error: { code: 'underived-profile' } });

    const prose = makeFakeThorChrome({ results: { 'git branch': { status: 128 }, 'git rev-parse': { status: 128 } } });
    await run(prose, ['status']);
    expect(prose.captured.stderr()).toContain('    thor-chrome status <repo>-<branch>\n');
  });

  it('refuses a second profile name and an invalid port', async () => {
    const fake = makeFakeThorChrome();
    await expect(run(fake, ['status', 'thrive', 'atlas'])).resolves.toBe(2);
    await expect(run(fake, ['status', 'thrive', '--port', '0'])).resolves.toBe(1);
    expect(fake.captured.stderr()).toBe(
      "Error: status takes one profile name (got 'thrive' and 'atlas')\nTry 'thor-chrome --help'.\n" +
        'thor-chrome: invalid port: 0 (must be 1–65535)\n',
    );
  });
});

// region | Helpers

/** Runs thor-chrome against the fake. */
function run(fake: FakeThorChrome, args: string[]): Promise<number> {
  return runThorChrome(args, fake.captured.output, fake.deps);
}

// endregion | Helpers
