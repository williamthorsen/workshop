import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { type FakeThorChrome, makeFakeThorChrome } from '../test-utils/fake-thor-chrome.ts';
import { runThorChrome } from '../thor-chrome.ts';

describe(runThorChrome, () => {
  it('prints the usage on stdout for --help wherever it appears, whatever --json says', async () => {
    const fake = makeFakeThorChrome();
    fake.makeProfile('thrive');
    await expect(run(fake, ['delete', 'thrive', '--json', '-h'])).resolves.toBe(0);
    expect(fake.captured.stdout()).toMatch(/^Launch a Chrome-family browser/);
    expect(fake.captured.stdout()).toContain(`<profile>       Profile directory under ${fake.profilesDir}\n`);
    expect(fake.captured.stderr()).toBe('');
  });

  it('launches when the first argument is an option or a URL, and reads the verb after a leading --json', async () => {
    const fake = makeFakeThorChrome({ env: { THOR_CHROME_APP: '/bin/sh' } });
    fake.makeProfile('thrive');
    await expect(run(fake, ['http://localhost:4798', '--dry-run', '--profile', 'thrive'])).resolves.toBe(0);
    await expect(run(fake, ['--json', 'list'])).resolves.toBe(0);
    const [launchLine = '', listLine = ''] = fake.captured.stdout().split('\n', 2);
    expect(launchLine).toMatch(/^\/bin\/sh .* http:\/\/localhost:4798 file:/);
    expect(listLine).toMatch(/^\{"profiles":\[/);
  });

  it('launches a URL that spells a verb when launch is named', async () => {
    const fake = makeFakeThorChrome({ env: { THOR_CHROME_APP: '/bin/sh' } });
    fake.makeProfile('thrive');
    await expect(run(fake, ['launch', '--dry-run', '--profile', 'thrive', 'list'])).resolves.toBe(0);
    expect(fake.captured.stdout()).toContain(` list file://${fake.profilesDir}/thrive/thor-chrome.html\n`);
  });

  it('refuses an unknown verb with status 2, as prose or as a JSON document', async () => {
    const fake = makeFakeThorChrome();
    await expect(run(fake, ['frobnicate'])).resolves.toBe(2);
    await expect(run(fake, ['--json', 'frobnicate'])).resolves.toBe(2);
    expect(fake.captured.stderr()).toBe("Error: unknown command 'frobnicate'\nTry 'thor-chrome --help'.\n");
    expect(fake.captured.stdout()).toBe(`{"error":{"code":"usage","message":"unknown command 'frobnicate'"}}\n`);
  });

  it.each([
    [['list', '--port', '1'], 'unknown option --port for list'],
    [['quit', '--stale'], 'unknown option --stale for quit'],
    [['--bogus'], 'unknown option --bogus for launch'],
    [['--profile'], '--profile requires a value'],
    [['--dry-run', '--profile', 'thrive', '--browser'], '--browser requires a value'],
    [['list', 'http://x'], "list takes no positional arguments (got 'http://x')"],
    [['quit', 'thrive', '--all'], "--all selects every running profile, so it takes no profile name (got 'thrive')"],
    [
      ['delete', '--stale', 'thrive'],
      "--stale selects the profiles to delete, so it takes no profile name (got 'thrive')",
    ],
    [['delete', 'thrive', '--all'], "--all selects the profiles to delete, so it takes no profile name (got 'thrive')"],
    [['delete', '--stale', '--all'], '--all and --stale each select a different set'],
    [
      ['quit', '--idle', '2h', 'thrive'],
      "--idle selects every idle running profile, so it takes no profile name (got 'thrive')",
    ],
    [['quit', '--all', '--idle', '2h'], '--all and --idle each select a different set'],
    [['quit', '--idle'], '--idle requires a value'],
    [['quit', '--idle', '2'], "invalid duration '2' (a whole number and s, m, h, or d, as in 2h)"],
    [['quit', '--idle', '0h'], "invalid duration '0h' (a whole number and s, m, h, or d, as in 2h)"],
    [['quit', '--idle', '2H'], "invalid duration '2H' (a whole number and s, m, h, or d, as in 2h)"],
    [['list', '--json=yes'], 'Option does not accept a value: --json'],
  ])('refuses %j with the usage message %j and status 2', async (args, message) => {
    const fake = makeFakeThorChrome();
    await expect(run(fake, ['--json', ...args])).resolves.toBe(2);
    expect(fake.readReport()).toStrictEqual({ error: { code: 'usage', message } });
  });

  it('sweeps stale profiles with THOR_CHROME_PROFILE set, which names no profile on the command line', async () => {
    const fake = makeFakeThorChrome({ env: { THOR_CHROME_PROFILE: 'thrive' } });
    fake.makeProfile('thrive');
    fake.makeProfile('widget-9', { origin: 'derived', branch: '9', repo: 'widget', repo_dir: `${fake.home}/gone` });
    await expect(run(fake, ['delete', '--stale'])).resolves.toBe(0);
    expect(fake.captured.stdout()).toContain("Deleted profile 'widget-9'");
  });

  it('reports a missing command under --json as missing-command with status 127, leaving stderr empty', async () => {
    const fake = makeFakeThorChrome({ env: { THOR_CHROME_APP: '/bin/sh' } });
    fs.rmSync(`${fake.env['PATH'] ?? ''}/lsof`);
    await expect(run(fake, ['--json', '--dry-run'])).resolves.toBe(127);
    expect(fake.readReport()).toMatchObject({ error: { code: 'missing-command' } });
    expect(fake.captured.stderr()).toBe('');
  });

  it('escapes a control character in an argument that it reports', async () => {
    const fake = makeFakeThorChrome({ env: { THOR_CHROME_APP: '/bin/sh' } });
    await expect(run(fake, ['--json', '--browser', 'bo\bgus'])).resolves.toBe(2);
    expect(fake.captured.stdout()).toContain(
      String.raw`"message":"unknown browser 'bo\u0008gus' (chrome, chrome-for-testing)"`,
    );
  });
});

// region | Helpers

/** Runs thor-chrome against the fake. */
function run(fake: FakeThorChrome, args: string[]): Promise<number> {
  return runThorChrome(args, fake.captured.output, fake.deps);
}

// endregion | Helpers
