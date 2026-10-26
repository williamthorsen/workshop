import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { type FakeThorChrome, makeFakeThorChrome } from '../test-utils/fake-thor-chrome.ts';
import { appBundle, makeExecutable, makeRunningFake, RUNNING_PID } from '../test-utils/launch-fixtures.ts';
import { runThorChrome } from '../thor-chrome.ts';

describe('launch', () => {
  describe('refusals', () => {
    it.each([
      ['invalid-port', ['--port', '99999', '--profile', 'thrive'], 1, 'invalid port: 99999 (must be 1–65535)'],
      [
        'invalid-profile-name',
        ['--profile', '../x'],
        1,
        "invalid profile name '../x' (letters, digits, dot, underscore and hyphen only)",
      ],
      ['invalid-profile-name', ['--profile', '..'], 1, "invalid profile name '..': '.' and '..' do not name a profile"],
      [
        'usage',
        ['--profile', 'thrive', '--browser', 'safari'],
        2,
        "unknown browser 'safari' (chrome, chrome-for-testing)",
      ],
      ['profile-missing', ['--profile', 'scratch'], 1, `profile 'scratch' does not exist at PROFILES/scratch`],
    ])('refuses with %s', async (code, args, status, message) => {
      const fake = makeFakeThorChrome({ env: { THOR_CHROME_APP: '/bin/sh' } });
      fake.makeProfile('thrive');
      await expect(run(fake, ['--json', ...args])).resolves.toBe(status);
      expect(readError(fake)).toStrictEqual({ code, message: message.replace('PROFILES', () => fake.profilesDir) });
      expect(fake.captured.stderr()).toBe('');
    });

    it('hints at --create for an unknown profile that the caller named', async () => {
      const fake = makeFakeThorChrome({ env: { THOR_CHROME_APP: '/bin/sh' } });
      await expect(run(fake, ['--dry-run', '--profile', 'scratch'])).resolves.toBe(1);
      expect(fake.captured.stderr()).toBe(
        `thor-chrome: profile 'scratch' does not exist at ${fake.profilesDir}/scratch\n` +
          '  Pass --create to make it, or list existing profiles: thor-chrome list\n',
      );
    });

    it('refuses an unknown THOR_CHROME_BROWSER with usage, naming the variable', async () => {
      const fake = makeFakeThorChrome({ env: { THOR_CHROME_APP: '/bin/sh', THOR_CHROME_BROWSER: 'safari' } });
      fake.makeProfile('thrive');
      await expect(run(fake, ['--json', '--profile', 'thrive'])).resolves.toBe(2);
      expect(readError(fake)).toStrictEqual({
        code: 'usage',
        message: "unknown browser 'safari' in THOR_CHROME_BROWSER (chrome, chrome-for-testing)",
      });
    });

    it('names the missing command with status 127', async () => {
      const fake = makeFakeThorChrome({ env: { THOR_CHROME_APP: '/bin/sh', PATH: '' } });
      await expect(run(fake, ['--dry-run', '--profile', 'thrive'])).resolves.toBe(127);
      expect(fake.captured.stderr()).toBe("thor-chrome: required command 'curl' not found\n");
    });

    it('refuses with browser-not-found for an absent executable, and for an uninstalled Chrome for Testing', async () => {
      const fake = makeFakeThorChrome({ env: { THOR_CHROME_APP: '/absent/chrome' } });
      fake.makeProfile('thrive');
      await expect(run(fake, ['--profile', 'thrive'])).resolves.toBe(127);
      expect(fake.captured.stderr()).toBe(
        'thor-chrome: chrome not found at /absent/chrome (override with THOR_CHROME_APP)\n',
      );

      const testing = makeFakeThorChrome({ env: { PLAYWRIGHT_BROWSERS_PATH: '/absent' } });
      await expect(run(testing, ['--json', '--profile', 'thrive', '--browser', 'chrome-for-testing'])).resolves.toBe(
        127,
      );
      expect(readError(testing)).toStrictEqual({
        code: 'browser-not-found',
        message: 'chrome-for-testing not found (install it with: npx playwright install chromium)',
      });
    });

    it('refuses with underived-profile outside a repository, naming the profile to pass', async () => {
      const fake = makeFakeThorChrome({
        env: { THOR_CHROME_APP: '/bin/sh' },
        results: { 'git branch': { status: 128 }, 'git rev-parse': { status: 128 } },
      });
      await expect(run(fake, ['--dry-run'])).resolves.toBe(1);
      expect(fake.captured.stderr()).toBe(
        "thor-chrome: no repository or branch resolved from the working directory, so the profile fell back to 'default'\n" +
          '  Name the profile instead:\n' +
          '    thor-chrome --profile <repo>-<branch> --port "$(thor-git branch-number <branch> --min 9000 --max 9999)"\n',
      );
    });

    it('refuses with process-list-unavailable when pgrep cannot search, writing nothing', async () => {
      const fake = makeFakeThorChrome({ env: { THOR_CHROME_APP: '/bin/sh' }, results: { pgrep: { status: 3 } } });
      fake.makeProfile('thrive');
      await expect(run(fake, ['--json', '--profile', 'thrive'])).resolves.toBe(1);
      expect(readError(fake)).toMatchObject({ code: 'process-list-unavailable' });
      expect(fake.readReport()['profile']).toMatchObject({ name: 'thrive', state: 'unknown' });
      expect(fs.readdirSync(`${fake.profilesDir}/thrive`)).toStrictEqual([]);
    });

    it('refuses a dry run when pgrep cannot search, naming the profile whose state is unknown', async () => {
      const fake = makeFakeThorChrome({ env: { THOR_CHROME_APP: '/bin/sh' }, results: { pgrep: { status: 3 } } });
      fake.makeProfile('thrive');
      await expect(run(fake, ['--dry-run', '--profile', 'thrive'])).resolves.toBe(1);
      expect(fake.captured.stderr()).toContain(
        "could not read the process list, so the state of profile 'thrive' is unknown",
      );
      expect(fake.captured.stdout()).toBe('');
    });

    it('refuses with profile-running-without-port', async () => {
      const fake = makeRunningFake({ port: undefined });
      await expect(run(fake, ['--dry-run', '--profile', 'thrive'])).resolves.toBe(1);
      expect(fake.captured.stderr()).toBe(
        `thor-chrome: profile 'thrive' is running (PID ${RUNNING_PID}) without a debugging port\n` +
          '  The browser discards --remote-debugging-port while an instance owns the profile.\n' +
          '  Quit it first: thor-chrome quit thrive\n',
      );
    });

    it('refuses with port-mismatch, reporting the running profile beside the error', async () => {
      const fake = makeRunningFake({ port: '9333' });
      await expect(run(fake, ['--json', '--dry-run', '--profile', 'thrive'])).resolves.toBe(1);
      expect(fake.readReport()).toMatchObject({
        error: { code: 'port-mismatch', message: "profile 'thrive' is already debugging on port 9333, not 9321" },
        profile: { name: 'thrive', pid: 4_242, port: 9_333, state: 'debugging' },
      });
    });

    it('refuses with endpoint-unresponsive, or policy-denied when the launch log recorded the policy', async () => {
      const fake = makeRunningFake({ port: '9321', results: { curl: { status: 7 } } });
      await expect(run(fake, ['--json', '--dry-run', '--profile', 'thrive'])).resolves.toBe(1);
      expect(readError(fake)).toMatchObject({ code: 'endpoint-unresponsive' });

      const denied = makeRunningFake({ port: '9321', results: { curl: { status: 7 } } });
      const log = `${denied.home}/tmp/thor-chrome-thrive.log`;
      fs.writeFileSync(log, 'DevTools remote debugging is disallowed by the system admin.\n');
      await expect(run(denied, ['--json', '--dry-run', '--profile', 'thrive'])).resolves.toBe(1);
      expect(readError(denied)).toStrictEqual({
        code: 'policy-denied',
        log,
        message: `profile 'thrive' is running (PID ${RUNNING_PID}) but policy blocked its debugging port`,
      });
    });

    it("names chrome-for-testing rather than a retry when policy blocked the running profile's port", async () => {
      const fake = makeRunningFake({ port: '9321', results: { curl: { status: 7 } } });
      fs.writeFileSync(
        `${fake.home}/tmp/thor-chrome-thrive.log`,
        'DevTools remote debugging is disallowed by the system admin.\n',
      );
      await expect(run(fake, ['--dry-run', '--profile', 'thrive'])).resolves.toBe(1);
      expect(fake.captured.stderr()).toContain('policy blocked its debugging port');
      expect(fake.captured.stderr()).toContain('relaunch with --browser chrome-for-testing');
      expect(fake.captured.stderr()).not.toContain('still be starting');
    });

    it('refuses with port-busy, naming the listener', async () => {
      const fake = makeFakeThorChrome({
        env: { THOR_CHROME_APP: '/bin/sh' },
        results: { lsof: { stdout: 'COMMAND PID USER FD TYPE\nno"de 4242 wthorsen 23u IPv4\n' } },
      });
      fake.makeProfile('thrive');
      await expect(run(fake, ['--json', '--dry-run', '--profile', 'thrive'])).resolves.toBe(1);
      expect(readError(fake)).toStrictEqual({
        code: 'port-busy',
        listener: 'no"de (PID 4242, user wthorsen)',
        message: 'port 9321 is held by no"de (PID 4242, user wthorsen)',
      });
      expect(fake.captured.stdout()).toContain(String.raw`"listener":"no\"de (PID 4242, user wthorsen)"`);
    });

    it('hints at freeing a busy port without naming a command', async () => {
      const fake = makeFakeThorChrome({
        env: { THOR_CHROME_APP: '/bin/sh' },
        results: { lsof: { stdout: 'COMMAND PID USER FD TYPE\nnode 4242 wthorsen 23u IPv4\n' } },
      });
      fake.makeProfile('thrive');
      await expect(run(fake, ['--dry-run', '--profile', 'thrive'])).resolves.toBe(1);
      expect(fake.captured.stderr()).toContain('Pick another port with --port, or stop the process that holds it.\n');
    });

    it('refuses with invalid-timeout for a launch budget that is not whole seconds', async () => {
      const fake = makeFakeThorChrome({ env: { THOR_CHROME_APP: '/bin/sh', THOR_CHROME_LAUNCH_TIMEOUT: 'soon' } });
      fake.makeProfile('thrive');
      await expect(run(fake, ['--profile', 'thrive'])).resolves.toBe(1);
      expect(fake.captured.stderr()).toBe(
        'thor-chrome: invalid THOR_CHROME_LAUNCH_TIMEOUT: soon (whole seconds, 1 or more)\n',
      );
    });

    it('refuses with launch-timeout when the endpoint never answers', async () => {
      const fake = makeFakeThorChrome({
        env: { THOR_CHROME_APP: '/bin/sh', THOR_CHROME_LAUNCH_TIMEOUT: '1' },
        results: { curl: { status: 7 } },
      });
      fake.makeProfile('thrive');
      await expect(run(fake, ['--json', '--profile', 'thrive'])).resolves.toBe(1);
      expect(readError(fake)).toStrictEqual({
        code: 'launch-timeout',
        log: `${fake.home}/tmp/thor-chrome-thrive.log`,
        message: "profile 'thrive' started but nothing answers on port 9321 after 1s",
      });
    });

    it('refuses with policy-denied when the launched browser declined the port', async () => {
      const fake = makeFakeThorChrome({
        env: { THOR_CHROME_APP: '/bin/sh', THOR_CHROME_LAUNCH_TIMEOUT: '1' },
        results: { curl: { status: 7 } },
      });
      fake.deps.spawnDetached = (_program, _args, options) => {
        fs.writeFileSync(options.logPath, 'DevTools remote debugging is disallowed by the system admin.\n');
      };
      fake.makeProfile('thrive');
      await expect(run(fake, ['--profile', 'thrive'])).resolves.toBe(1);
      expect(fake.captured.stderr()).toContain("thor-chrome: policy blocked remote debugging for profile 'thrive'\n");
      expect(fake.captured.stderr()).toContain('  thor-chrome quit thrive\n');
    });

    it('names chrome-for-testing rather than a retry when policy blocked the launched browser', async () => {
      const fake = makeFakeThorChrome({
        env: { THOR_CHROME_APP: '/bin/sh', THOR_CHROME_LAUNCH_TIMEOUT: '1' },
        results: { curl: { status: 7 } },
      });
      fake.deps.spawnDetached = (_program, _args, options) => {
        fs.writeFileSync(options.logPath, 'DevTools remote debugging is disallowed by the system admin.\n');
      };
      fake.makeProfile('thrive');
      await expect(run(fake, ['--profile', 'thrive'])).resolves.toBe(1);
      expect(fake.captured.stderr()).toContain('relaunch with --browser chrome-for-testing');
      expect(fake.captured.stderr()).not.toContain('still be starting');
    });

    it('reads a policy refusal back from the log that open was given for the output', async () => {
      const app = '/Applications/Fake.app/Contents/MacOS/fake';
      const fake = makeFakeThorChrome({
        env: { THOR_CHROME_LAUNCH_TIMEOUT: '1' },
        results: { launchctl: { stdout: 'Background\n' }, curl: { status: 7 } },
      });
      fake.env['THOR_CHROME_APP'] = makeExecutable(fake, app);
      const { run: answer } = fake.deps;
      fake.deps.run = (program, args, options) => {
        if (program === 'open') {
          const log = args[args.indexOf('--stdout') + 1] ?? '';
          fs.writeFileSync(log, 'DevTools remote debugging is disallowed by the system admin.\n');
        }
        return answer(program, args, options);
      };
      fake.makeProfile('thrive');
      await expect(run(fake, ['--json', '--profile', 'thrive'])).resolves.toBe(1);
      expect(readError(fake)).toMatchObject({ code: 'policy-denied' });
    });

    it.each([
      ['open refuses the launch', { open: { status: 1 } }, makeBundledApp],
      ['the executable is outside an app bundle', {}, () => '/bin/sh'],
      ['the bundle is unsigned', { codesign: { status: 1 } }, makeBundledApp],
    ])('names the tmux restart when %s outside the GUI login session', async (_description, results, makeApp) => {
      const fake = makeFakeThorChrome({ results: { ...results, launchctl: { stdout: 'Background\n' } } });
      fake.env['THOR_CHROME_APP'] = makeApp(fake);
      fake.makeProfile('thrive');
      await expect(run(fake, ['--profile', 'thrive'])).resolves.toBe(1);
      expect(fake.captured.stderr()).toContain(
        '  Or restart the tmux server from a terminal in the GUI login session: tmux kill-server, then tmux\n',
      );
    });

    it('refuses with session-unavailable for an executable outside an app bundle, before writing anything', async () => {
      const fake = makeFakeThorChrome({
        env: { THOR_CHROME_APP: '/bin/sh' },
        results: { launchctl: { stdout: 'Background\n' } },
      });
      await expect(run(fake, ['--json', '--dry-run'])).resolves.toBe(1);
      expect(readError(fake)).toStrictEqual({
        code: 'session-unavailable',
        message:
          '/bin/sh is not inside an app bundle, which open needs outside the GUI login session (launchctl managername: Background); launch from a terminal in the GUI login session instead',
      });
      expect(fs.existsSync(`${fake.profilesDir}/widget-321`)).toBe(false);
    });

    it('refuses with session-unavailable for an unsigned bundle, naming the ad hoc signature', async () => {
      const app = '/Applications/My Fake.app/Contents/MacOS/fake';
      const fake = makeFakeThorChrome({
        results: { launchctl: { stdout: 'Background\n' }, codesign: { status: 1 } },
      });
      fake.env['THOR_CHROME_APP'] = makeExecutable(fake, app);
      fake.makeProfile('thrive');
      await expect(run(fake, ['--profile', 'thrive'])).resolves.toBe(1);
      expect(fake.captured.stderr()).toContain(
        `  Or sign the bundle ad hoc, which open accepts: codesign --force --deep --sign - ${appBundle(fake, app).replaceAll(' ', String.raw`\ `)}\n`,
      );
    });

    it('refuses with session-unavailable when open refuses the launch', async () => {
      const app = '/Applications/Fake.app/Contents/MacOS/fake';
      const fake = makeFakeThorChrome({ results: { launchctl: { stdout: 'Background\n' }, open: { status: 1 } } });
      fake.env['THOR_CHROME_APP'] = makeExecutable(fake, app);
      fake.makeProfile('thrive');
      await expect(run(fake, ['--json', '--profile', 'thrive'])).resolves.toBe(1);
      expect(readError(fake)).toStrictEqual({
        code: 'session-unavailable',
        message:
          'the shell is outside the GUI login session (launchctl managername: Background), and open refused the launch; launch from a terminal in the GUI login session instead',
      });
    });
  });
});

// region | Helpers

/** Creates an executable inside an app bundle in the fake's filesystem and returns its path. */
function makeBundledApp(fake: FakeThorChrome): string {
  return makeExecutable(fake, '/Applications/Fake.app/Contents/MacOS/fake');
}

/** Returns the error object of the JSON document that the run printed. */
function readError(fake: FakeThorChrome): unknown {
  return fake.readReport()['error'];
}

/** Runs thor-chrome against the fake. */
function run(fake: FakeThorChrome, args: string[]): Promise<number> {
  return runThorChrome(args, fake.captured.output, fake.deps);
}

// endregion | Helpers
