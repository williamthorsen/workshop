import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { type FakeThorChrome, makeFakeThorChrome } from '../test-utils/fake-thor-chrome.ts';
import { appBundle, makeExecutable, makeRunningFake } from '../test-utils/launch-fixtures.ts';
import { runThorChrome } from '../thor-chrome.ts';

describe('launch', () => {
  describe('dry run', () => {
    it('prints the command that would launch the derived profile on the derived port, then the pages, a blank tab first', async () => {
      const fake = makeFakeThorChrome({ env: { THOR_CHROME_APP: '/bin/sh' } });
      await expect(run(fake, ['--dry-run'])).resolves.toBe(0);
      const profileDir = `${fake.profilesDir}/widget-321`;
      expect(fake.captured.stdout()).toBe(
        `/bin/sh --remote-debugging-port=20321 --user-data-dir=${profileDir} --disable-search-engine-choice-screen ` +
          '--hide-crash-restore-bubble --no-default-browser-check --no-first-run --no-startup-window\n' +
          `Opens: about:blank\nOpens: file://${profileDir}/thor-chrome.html\n`,
      );
      expect(fake.calls.some((call) => call.program === 'thor-git')).toBe(false);
      expect(fs.existsSync(profileDir)).toBe(false);
    });

    it('reports the command and the pages as arrays under --json', async () => {
      const fake = makeFakeThorChrome({ env: { THOR_CHROME_APP: '/bin/sh' } });
      fake.makeProfile('thrive');
      await expect(
        run(fake, ['--json', '--dry-run', '--profile', 'thrive', '--port', '9500', 'http://x']),
      ).resolves.toBe(0);
      const profileDir = `${fake.profilesDir}/thrive`;
      expect(fake.readReport()).toStrictEqual({
        command: [
          '/bin/sh',
          '--remote-debugging-port=9500',
          `--user-data-dir=${profileDir}`,
          '--disable-search-engine-choice-screen',
          '--hide-crash-restore-bubble',
          '--no-default-browser-check',
          '--no-first-run',
          '--no-startup-window',
        ],
        pages: ['http://x', `file://${profileDir}/thor-chrome.html`],
        dryRun: true,
      });
    });

    it('goes through open -g -n outside the GUI login session', async () => {
      const app = '/Applications/Fake.app/Contents/MacOS/fake';
      const fake = makeFakeThorChrome({
        env: { THOR_CHROME_APP: '/bin/sh' },
        results: { launchctl: { stdout: 'Background\n' } },
      });
      fake.env['THOR_CHROME_APP'] = makeExecutable(fake, app);
      fake.makeProfile('thrive');
      await expect(run(fake, ['--dry-run', '--profile', 'thrive'])).resolves.toBe(0);
      const log = `${fake.home}/tmp/thor-chrome-thrive.log`;
      expect(fake.captured.stdout()).toMatch(
        new RegExp(
          `^open -g -n -a ${escapeRegExp(appBundle(fake, app))} --stdout ${escapeRegExp(log)} --stderr ${escapeRegExp(log)} --args --remote-debugging-port=20321 `,
        ),
      );
      expect(fake.calls).toContainEqual({ args: ['--display', appBundle(fake, app)], program: 'codesign' });
    });

    it('reports the open form as the command array under --json outside the GUI login session', async () => {
      const app = '/Applications/Fake.app/Contents/MacOS/fake';
      const fake = makeFakeThorChrome({ results: { launchctl: { stdout: 'Background\n' } } });
      fake.env['THOR_CHROME_APP'] = makeExecutable(fake, app);
      fake.makeProfile('thrive');
      await expect(run(fake, ['--json', '--dry-run', '--profile', 'thrive'])).resolves.toBe(0);
      const log = `${fake.home}/tmp/thor-chrome-thrive.log`;
      const profileDir = `${fake.profilesDir}/thrive`;
      expect(fake.readReport()).toStrictEqual({
        command: [
          'open',
          '-g',
          '-n',
          '-a',
          appBundle(fake, app),
          '--stdout',
          log,
          '--stderr',
          log,
          '--args',
          '--remote-debugging-port=20321',
          `--user-data-dir=${profileDir}`,
          '--disable-search-engine-choice-screen',
          '--hide-crash-restore-bubble',
          '--no-default-browser-check',
          '--no-first-run',
          '--no-startup-window',
        ],
        pages: ['about:blank', `file://${profileDir}/thor-chrome.html`],
        dryRun: true,
      });
    });

    it('adds --headless and starts directly outside the GUI login session for a headless launch', async () => {
      const fake = makeFakeThorChrome({
        env: { THOR_CHROME_APP: '/bin/sh' },
        results: { launchctl: { stdout: 'Background\n' } },
      });
      fake.makeProfile('thrive');
      await expect(run(fake, ['--json', '--dry-run', '--headless', '--profile', 'thrive'])).resolves.toBe(0);
      const { command } = fake.readReport();
      expect(Array.isArray(command) ? command.slice(0, 1).concat(command.slice(-2)) : command).toStrictEqual([
        '/bin/sh',
        '--no-startup-window',
        '--headless',
      ]);
      expect(fake.calls.some((call) => call.program === 'codesign')).toBe(false);
    });

    it('launches directly when launchctl names no session', async () => {
      const fake = makeFakeThorChrome({
        env: { THOR_CHROME_APP: '/bin/sh' },
        results: { launchctl: { status: 1, stdout: '' } },
      });
      fake.makeProfile('thrive');
      await run(fake, ['--dry-run', '--profile', 'thrive']);
      expect(fake.captured.stdout()).toMatch(/^\/bin\/sh --remote-debugging-port=20321 /);
    });

    it('starts nothing when the profile is already debugging on the port, and opens only the URLs there', async () => {
      const fake = makeRunningFake({ port: '20321' });
      await expect(run(fake, ['--dry-run', '--profile', 'thrive', 'http://x'])).resolves.toBe(0);
      expect(fake.captured.stdout()).toBe("profile 'thrive' is running on port 20321\nOpens: http://x\n");
    });

    it('reports a null command and no pages under --json for a running profile without a URL', async () => {
      const fake = makeRunningFake({ port: '20321' });
      await expect(run(fake, ['--json', '--dry-run', '--profile', 'thrive'])).resolves.toBe(0);
      expect(fake.readReport()).toStrictEqual({ command: null, pages: [], dryRun: true });
    });

    it('takes THOR_CHROME_PROFILE as the profile, and --profile over it', async () => {
      const fake = makeFakeThorChrome({ env: { THOR_CHROME_APP: '/bin/sh', THOR_CHROME_PROFILE: 'thrive' } });
      fake.makeProfile('thrive');
      fake.makeProfile('atlas');
      await run(fake, ['--dry-run']);
      await run(fake, ['--dry-run', '--profile', 'atlas']);
      // Each dry run prints its command, then one line per page that it would open
      const lines = fake.captured.stdout().split('\n');
      const first = lines[0] ?? '';
      const second = lines[3] ?? '';
      expect(first).toContain(`--user-data-dir=${fake.profilesDir}/thrive `);
      expect(second).toContain(`--user-data-dir=${fake.profilesDir}/atlas `);
    });

    it('takes THOR_CHROME_BROWSER as the browser, and --browser over it', async () => {
      const fake = makeFakeThorChrome({
        env: {
          THOR_CHROME_APP: '/bin/sh',
          THOR_CHROME_BROWSER: 'chrome-for-testing',
          PLAYWRIGHT_BROWSERS_PATH: '/absent',
        },
      });
      fake.makeProfile('thrive');
      await expect(run(fake, ['--dry-run', '--profile', 'thrive'])).resolves.toBe(127);
      expect(fake.captured.stderr()).toContain('chrome-for-testing not found');
      await expect(run(fake, ['--dry-run', '--profile', 'thrive', '--browser', 'chrome'])).resolves.toBe(0);
      expect(fake.captured.stdout()).toMatch(/^\/bin\/sh /);
    });

    it('omits the profile from a refusal raised before the profile is resolved', async () => {
      const fake = makeFakeThorChrome({ env: { THOR_CHROME_APP: '/bin/sh' } });
      await expect(run(fake, ['--json', '--dry-run', '--profile', '..'])).resolves.toBe(1);
      expect(fake.readReport()).not.toHaveProperty('profile');
    });

    it('falls back to port 9222 outside a repository', async () => {
      const fake = makeFakeThorChrome({
        env: { THOR_CHROME_APP: '/bin/sh' },
        results: { 'git branch': { status: 128 }, 'git rev-parse': { status: 128 } },
      });
      await expect(run(fake, ['--dry-run', '--create', '--profile', 'scratch'])).resolves.toBe(0);
      expect(fake.captured.stdout()).toContain('--remote-debugging-port=9222 ');
    });
  });

  describe('launch', () => {
    it('starts the browser detached, writes the record and the page, and reports the endpoint', async () => {
      const fake = makeFakeThorChrome({ env: { THOR_CHROME_APP: '/bin/sh' } });
      await expect(run(fake, ['http://localhost:4798'])).resolves.toBe(0);
      const profileDir = `${fake.profilesDir}/widget-321`;
      expect(fake.captured.stdout()).toBe(
        "chrome: profile 'widget-321' on port 20321\nDevTools: http://127.0.0.1:20321/json/version\n",
      );
      expect(fake.spawned).toHaveLength(1);
      expect(fake.spawned[0]?.program).toBe('/bin/sh');
      expect(fake.spawned[0]?.options).toStrictEqual({ logPath: `${fake.home}/tmp/thor-chrome-widget-321.log` });
      expect(fake.spawned[0]?.args.at(-1)).toBe('--no-startup-window');
      expect(fake.opened).toStrictEqual([
        { port: '20321', url: 'http://localhost:4798' },
        { port: '20321', url: `file://${profileDir}/thor-chrome.html` },
      ]);
      expect(fs.readFileSync(`${profileDir}/.thor-chrome.record`, 'utf8')).toBe(
        `origin=derived\nbranch=321\nrepo=widget\nrepo_dir=${fake.workRepoDir}\n`,
      );
      expect(fs.readFileSync(`${profileDir}/thor-chrome.html`, 'utf8')).toContain('<title>widget-321 · :20321</title>');
    });

    it('opens a blank tab ahead of the instance page when no URL is given', async () => {
      const fake = makeFakeThorChrome({ env: { THOR_CHROME_APP: '/bin/sh' } });
      await expect(run(fake, [])).resolves.toBe(0);
      expect(fake.opened.map((page) => page.url)).toStrictEqual([
        'about:blank',
        `file://${fake.profilesDir}/widget-321/thor-chrome.html`,
      ]);
    });

    it('reports the port that it was asked for and its endpoint', async () => {
      const fake = makeFakeThorChrome({ env: { THOR_CHROME_APP: '/bin/sh' } });
      fake.makeProfile('thrive');
      await expect(run(fake, ['--profile', 'thrive', '--port', '9333'])).resolves.toBe(0);
      expect(fake.captured.stdout()).toBe(
        "chrome: profile 'thrive' on port 9333\nDevTools: http://127.0.0.1:9333/json/version\n",
      );
    });

    it('names the browser that it launched, in prose and under --json', async () => {
      const fake = makeFakeThorChrome();
      fake.env['PLAYWRIGHT_BROWSERS_PATH'] = installChromeForTesting(fake);
      fake.makeProfile('thrive');
      await expect(run(fake, ['--profile', 'thrive', '--browser', 'chrome-for-testing'])).resolves.toBe(0);
      await expect(run(fake, ['--json', '--profile', 'thrive', '--browser', 'chrome-for-testing'])).resolves.toBe(0);
      const [prose = '', , json = ''] = fake.captured.stdout().split('\n', 3);
      expect(prose).toBe("chrome-for-testing: profile 'thrive' on port 20321");
      expect(JSON.parse(json)).toMatchObject({ browser: 'chrome-for-testing' });
    });

    it('replaces the record left by an earlier launch', async () => {
      const fake = makeFakeThorChrome({ env: { THOR_CHROME_APP: '/bin/sh' } });
      fake.makeProfile('widget-321', {
        origin: 'derived',
        branch: '9',
        repo: 'widget',
        repo_dir: `${fake.home}/work/stale-path`,
      });
      await expect(run(fake, [])).resolves.toBe(0);
      expect(fs.readFileSync(`${fake.profilesDir}/widget-321/.thor-chrome.record`, 'utf8')).toBe(
        `origin=derived\nbranch=321\nrepo=widget\nrepo_dir=${fake.workRepoDir}\n`,
      );
    });

    it('derives the profile and port from --repo and --branch where git resolves nothing, recording no directory', async () => {
      const outside = makeFakeThorChrome({
        env: { THOR_CHROME_APP: '/bin/sh' },
        results: { 'git branch': { status: 128 }, 'git rev-parse': { status: 128 } },
      });
      await expect(run(outside, ['--repo', 'widget', '--branch', 'main'])).resolves.toBe(0);
      expect(outside.captured.stdout()).toContain("profile 'widget-main' on port 36036");
      expect(fs.readFileSync(`${outside.profilesDir}/widget-main/.thor-chrome.record`, 'utf8')).toBe(
        'origin=derived\nbranch=main\nrepo=widget\nrepo_dir=\n',
      );

      const inside = makeFakeThorChrome({
        env: { THOR_CHROME_APP: '/bin/sh' },
        results: { 'git branch --show-current': { stdout: 'main\n' } },
      });
      await expect(run(inside, [])).resolves.toBe(0);
      expect(inside.captured.stdout()).toContain("profile 'widget-main' on port 36036");
    });

    it('lets --branch stand in for the branch alone, keeping the repository that git reports', async () => {
      const fake = makeFakeThorChrome({ env: { THOR_CHROME_APP: '/bin/sh' } });
      await expect(run(fake, ['--branch', 'main'])).resolves.toBe(0);
      expect(fs.readFileSync(`${fake.profilesDir}/widget-main/.thor-chrome.record`, 'utf8')).toBe(
        `origin=derived\nbranch=main\nrepo=widget\nrepo_dir=${fake.workRepoDir}\n`,
      );
    });

    it('starts nothing and opens only the URLs when the profile is already debugging on the port', async () => {
      const fake = makeRunningFake({ port: '20321' });
      await expect(run(fake, ['--profile', 'thrive', 'http://x'])).resolves.toBe(0);
      expect(fake.captured.stdout()).toContain("profile 'thrive' on port 20321");
      expect(fake.spawned).toHaveLength(0);
      expect(fake.opened).toStrictEqual([{ port: '20321', url: 'http://x' }]);
      expect(fs.existsSync(`${fake.profilesDir}/thrive/thor-chrome.html`)).toBe(false);
    });

    it('names a headless launch in prose and under --json', async () => {
      const fake = makeFakeThorChrome({ env: { THOR_CHROME_APP: '/bin/sh' } });
      fake.makeProfile('thrive');
      await expect(run(fake, ['--headless', '--profile', 'thrive'])).resolves.toBe(0);
      expect(fake.captured.stdout()).toContain("chrome: profile 'thrive' on port 20321 (headless)\n");
      expect(fake.spawned[0]?.args).toContain('--headless');
      expect(fake.opened.map((page) => page.url)).toStrictEqual([
        'about:blank',
        `file://${fake.profilesDir}/thrive/thor-chrome.html`,
      ]);
    });

    it('reports the mode of the running browser for a launch that opens its URLs there', async () => {
      const fake = makeRunningFake({ isHeadless: true, port: '20321' });
      await expect(run(fake, ['--json', '--headless', '--profile', 'thrive', 'http://x'])).resolves.toBe(0);
      expect(fake.readReport()).toMatchObject({ profile: { headless: true, state: 'debugging' } });
    });

    it('opens nothing when the profile is already debugging and no URL is given', async () => {
      const fake = makeRunningFake({ port: '20321' });
      await expect(run(fake, ['--profile', 'thrive'])).resolves.toBe(0);
      expect(fake.spawned).toHaveLength(0);
      expect(fake.opened).toStrictEqual([]);
    });

    it('records a named profile as named and writes no record for an underived one', async () => {
      const fake = makeFakeThorChrome({ env: { THOR_CHROME_APP: '/bin/sh' } });
      fake.makeProfile('thrive');
      await run(fake, ['--profile', 'thrive']);
      expect(fs.readFileSync(`${fake.profilesDir}/thrive/.thor-chrome.record`, 'utf8')).toBe('origin=named\n');

      const outside = makeFakeThorChrome({
        env: { THOR_CHROME_APP: '/bin/sh' },
        results: { 'git branch': { status: 128 }, 'git rev-parse': { status: 128 } },
      });
      outside.makeProfile('default');
      await expect(run(outside, [])).resolves.toBe(0);
      expect(fs.existsSync(`${outside.profilesDir}/default/.thor-chrome.record`)).toBe(false);
    });

    it('reports the launched profile and the browser under --json', async () => {
      const fake = makeFakeThorChrome({ env: { THOR_CHROME_APP: '/bin/sh' } });
      fake.makeProfile('thrive');
      await expect(run(fake, ['--json', '--profile', 'thrive'])).resolves.toBe(0);
      expect(fake.readReport()).toMatchObject({
        browser: 'chrome',
        profile: { devtools: 'http://127.0.0.1:20321/json/version', name: 'thrive', port: 20_321, state: 'debugging' },
      });
    });

    it('launches through open outside the GUI login session, emptying the log first', async () => {
      const app = '/Applications/Fake.app/Contents/MacOS/fake';
      const fake = makeFakeThorChrome({ results: { launchctl: { stdout: 'Background\n' } } });
      fake.env['THOR_CHROME_APP'] = makeExecutable(fake, app);
      fake.makeProfile('thrive');
      const log = `${fake.home}/tmp/thor-chrome-thrive.log`;
      fs.writeFileSync(log, 'earlier output');
      await expect(run(fake, ['--profile', 'thrive'])).resolves.toBe(0);
      expect(fake.spawned).toHaveLength(0);
      expect(fake.calls.find((call) => call.program === 'open')?.args.slice(0, 4)).toStrictEqual([
        '-g',
        '-n',
        '-a',
        appBundle(fake, app),
      ]);
      expect(fs.readFileSync(log, 'utf8')).toBe('');
    });

    it('names the open command on the instance page outside the GUI login session', async () => {
      const app = '/Applications/Fake.app/Contents/MacOS/fake';
      const fake = makeFakeThorChrome({ results: { launchctl: { stdout: 'Background\n' } } });
      fake.env['THOR_CHROME_APP'] = makeExecutable(fake, app);
      fake.makeProfile('thrive');
      await expect(run(fake, ['--profile', 'thrive'])).resolves.toBe(0);
      expect(fs.readFileSync(`${fake.profilesDir}/thrive/thor-chrome.html`, 'utf8')).toContain(
        `<pre>open -g -n -a ${appBundle(fake, app)} --stdout `,
      );
    });

    it('polls the endpoint until it answers', async () => {
      let probes = 0;
      const fake = makeFakeThorChrome({
        env: { THOR_CHROME_APP: '/bin/sh' },
        run: (program) => {
          if (program === 'curl') return { status: ++probes < 3 ? 7 : 0, stderr: '', stdout: '' };
          return answerDefault(program);
        },
      });
      fake.makeProfile('thrive');
      await expect(run(fake, ['--profile', 'thrive', '--port', '9500'])).resolves.toBe(0);
      expect(probes).toBe(3);
    });
  });
});

// region | Helpers

/** Answers a call as the fake's defaults do, for a replacement run that overrides one program. */
function answerDefault(program: string) {
  const answers: Record<string, { status: number; stdout: string }> = {
    git: { status: 0, stdout: '' },
    launchctl: { status: 0, stdout: 'Aqua\n' },
    lsof: { status: 1, stdout: '' },
    pgrep: { status: 1, stdout: '' },
  };
  return { stderr: '', ...(answers[program] ?? { status: 0, stdout: '' }) };
}

/** Escapes a string for use inside a regular expression. */
function escapeRegExp(value: string): string {
  return value.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);
}

/** Installs a placeholder Chrome for Testing executable inside the fixture home and returns the browsers directory. */
function installChromeForTesting(fake: FakeThorChrome): string {
  const root = `${fake.home}/pw`;
  const dir = `${root}/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/Google Chrome for Testing`, '#!/bin/sh\n', { mode: 0o755 });
  return root;
}

/** Runs thor-chrome against the fake. */
function run(fake: FakeThorChrome, args: string[]): Promise<number> {
  return runThorChrome(args, fake.captured.output, fake.deps);
}

// endregion | Helpers
