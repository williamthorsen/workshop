import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { readDevtoolsActivePort } from '../devtools-active-port.ts';
import { startProxy } from '../serve-proxy.ts';
import { FAKE_ENTRY_SCRIPT, type FakeThorChrome, makeFakeThorChrome } from '../test-utils/fake-thor-chrome.ts';
import { runThorChrome } from '../thor-chrome.ts';

const BROWSER_PID = 4242;

describe('serve-proxy', () => {
  it('serves the advertised port in front of the recorded one until the browser exits, writing no report', async () => {
    const fake = makeFakeThorChrome();
    const profileDir = makeProfileWithPort(fake, '53001');
    let checks = 0;
    fake.deps.isProcessAlive = (pid) => {
      checks += 1;
      return pid === BROWSER_PID && checks < 3;
    };
    await expect(run(fake, serveArgs(profileDir))).resolves.toBe(0);
    expect(fake.proxies).toStrictEqual([{ isClosed: true, listenPort: '20321', upstreamPort: '53001' }]);
    expect(fake.calls).toContainEqual({
      args: ['--silent', '--fail', '--max-time', '1', 'http://127.0.0.1:53001/json/version'],
      program: 'curl',
    });
    expect(fake.captured.combined()).toBe('');
  });

  it('closes the proxy and exits 0 when asked to terminate', async () => {
    const fake = makeFakeThorChrome();
    const profileDir = makeProfileWithPort(fake, '53001');
    fake.deps.isProcessAlive = () => {
      fake.terminate();
      return true;
    };
    await expect(run(fake, serveArgs(profileDir))).resolves.toBe(0);
    expect(fake.proxies.map((proxy) => proxy.isClosed)).toStrictEqual([true]);
  });

  it('refuses with devtools-port-unknown when the browser records no port within the launch budget', async () => {
    const fake = makeFakeThorChrome({ env: { THOR_CHROME_LAUNCH_TIMEOUT: '2' } });
    const profileDir = fake.makeProfile('thrive');
    await expect(run(fake, ['--json', ...serveArgs(profileDir)])).resolves.toBe(1);
    expect(fake.readReport()).toMatchObject({ error: { code: 'devtools-port-unknown' } });
    expect(fake.proxies).toStrictEqual([]);
  });

  it('refuses with endpoint-unresponsive when the recorded port does not answer', async () => {
    const fake = makeFakeThorChrome({ results: { curl: { status: 7 } } });
    const profileDir = makeProfileWithPort(fake, '53001');
    await expect(run(fake, ['--json', ...serveArgs(profileDir)])).resolves.toBe(1);
    expect(fake.readReport()).toMatchObject({ error: { code: 'endpoint-unresponsive' } });
  });

  it('refuses with port-busy when another process holds the advertised port', async () => {
    const fake = makeFakeThorChrome();
    const profileDir = makeProfileWithPort(fake, '53001');
    fake.deps.startCdpProxy = () =>
      Promise.reject(Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' }));
    await expect(run(fake, ['--json', ...serveArgs(profileDir)])).resolves.toBe(1);
    expect(fake.readReport()).toMatchObject({ error: { code: 'port-busy' } });
  });

  it('refuses an advertised port that is not a valid port', async () => {
    const fake = makeFakeThorChrome();
    await expect(
      run(fake, ['--json', 'serve-proxy', '--port', 'x', '--profile-dir', '/p', '--browser-pid', '1']),
    ).resolves.toBe(1);
    expect(fake.readReport()).toMatchObject({ error: { code: 'invalid-port' } });
  });

  it.each([
    ['a missing option', ['--port', '20321', '--profile-dir', '/p']],
    ['an operand', ['--port', '20321', '--profile-dir', '/p', '--browser-pid', '1', 'extra']],
  ])('refuses %s as a usage error', async (_label, args) => {
    const fake = makeFakeThorChrome();
    await expect(run(fake, ['serve-proxy', ...args])).resolves.toBe(2);
    expect(fake.proxies).toStrictEqual([]);
  });
});

describe(startProxy, () => {
  it('starts serve-proxy detached through node, logging beside the launch log', () => {
    const fake = makeFakeThorChrome();
    const logPath = startProxy(fake.makeInvocation(), {
      browserPid: '4242',
      port: '20321',
      profile: 'thrive',
      profileDir: '/profiles/thrive',
    });
    expect(logPath).toBe(`${fake.home}/tmp/thor-chrome-thrive.proxy.log`);
    expect(fake.spawned).toStrictEqual([
      {
        args: [
          FAKE_ENTRY_SCRIPT,
          'serve-proxy',
          '--port',
          '20321',
          '--profile-dir',
          '/profiles/thrive',
          '--browser-pid',
          '4242',
        ],
        options: { logPath },
        program: process.execPath,
      },
    ]);
  });
});

describe(readDevtoolsActivePort, () => {
  it('reads the port from the first line and ignores the browser path on the second', () => {
    const fake = makeFakeThorChrome();
    expect(readDevtoolsActivePort(makeProfileWithPort(fake, '53001'))).toBe('53001');
  });

  it('returns undefined when the file is absent', () => {
    const fake = makeFakeThorChrome();
    expect(readDevtoolsActivePort(fake.makeProfile('thrive'))).toBeUndefined();
  });

  it.each([
    ['is empty', ''],
    ['names no port', 'junk\n'],
  ])('returns undefined when the file %s', (_label, content) => {
    const fake = makeFakeThorChrome();
    const profileDir = fake.makeProfile('thrive');
    fs.writeFileSync(`${profileDir}/DevToolsActivePort`, content);
    expect(readDevtoolsActivePort(profileDir)).toBeUndefined();
  });
});

// region | Helpers

/** Creates a profile whose browser recorded a DevTools port, as Chrome does once its endpoint listens. */
function makeProfileWithPort(fake: FakeThorChrome, port: string): string {
  const profileDir = fake.makeProfile('thrive');
  fs.writeFileSync(`${profileDir}/DevToolsActivePort`, `${port}\n/devtools/browser/B\n`);
  return profileDir;
}

/** Runs thor-chrome against a fake. */
function run(fake: FakeThorChrome, args: string[]): Promise<number> {
  return runThorChrome(args, fake.captured.output, fake.deps);
}

/** Returns the arguments with which a launch starts serve-proxy for a profile on port 20321. */
function serveArgs(profileDir: string): string[] {
  return ['serve-proxy', '--port', '20321', '--profile-dir', profileDir, '--browser-pid', String(BROWSER_PID)];
}

// endregion | Helpers
