import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { type FakeThorChrome, makeFakeThorChrome, makeRunningFakeThorChrome } from '../test-utils/fake-thor-chrome.ts';
import { runThorChrome } from '../thor-chrome.ts';

describe('delete', () => {
  it("removes each named profile's directory and reports it, leaving the others", async () => {
    const fake = makeFakeThorChrome();
    for (const name of ['thrive', 'atlas', 'keep']) fake.makeProfile(name);
    await expect(run(fake, ['delete', 'thrive', 'atlas'])).resolves.toBe(0);
    expect(fake.captured.stdout()).toBe(
      `Deleted profile 'thrive' (${fake.profilesDir}/thrive).\nDeleted profile 'atlas' (${fake.profilesDir}/atlas).\n`,
    );
    expect(fs.readdirSync(fake.profilesDir)).toStrictEqual(['keep']);
  });

  it('resolves the derived profile when none is named', async () => {
    const fake = makeFakeThorChrome();
    fake.makeProfile('widget-321');
    await expect(run(fake, ['delete'])).resolves.toBe(0);
    expect(fake.captured.stdout()).toContain("Deleted profile 'widget-321'");
  });

  it('reports what it would remove and removes nothing under --dry-run', async () => {
    const fake = makeFakeThorChrome();
    fake.makeProfile('thrive');
    await expect(run(fake, ['delete', 'thrive', '--dry-run'])).resolves.toBe(0);
    await expect(run(fake, ['delete', 'thrive', '--dry-run', '--json'])).resolves.toBe(0);
    expect(fake.captured.stdout()).toMatch(
      new RegExp(
        `^Would delete profile 'thrive' \\(.*/thrive\\)\\.\n\\{"profiles":\\[\\{"name":"thrive",.*"state":"deleted",.*\\],"dryRun":true\\}\n$`,
      ),
    );
    expect(fs.existsSync(`${fake.profilesDir}/thrive`)).toBe(true);
  });

  it('reports the provenance that a deleted profile recorded under --json', async () => {
    const fake = makeFakeThorChrome();
    fake.makeProfile('thrive', { origin: 'named' });
    await expect(run(fake, ['delete', 'thrive', '--json'])).resolves.toBe(0);
    expect(fake.readReport()['profiles']).toMatchObject([{ origin: 'named', stale: false, state: 'deleted' }]);
  });

  it('refuses a running profile with profile-running, naming quit and --force, and deletes the rest', async () => {
    const fake = makeRunningFakeThorChrome(['thrive']);
    fake.makeProfile('atlas');
    await expect(run(fake, ['delete', 'thrive', 'atlas'])).resolves.toBe(1);
    expect(fake.captured.stderr()).toBe(
      "thor-chrome: profile 'thrive' is running (PID 4242)\n" +
        '  Quit it first: thor-chrome quit thrive\n' +
        '  Or quit it and delete it in one step: thor-chrome delete thrive --force\n',
    );
    expect(fs.readdirSync(fake.profilesDir)).toStrictEqual(['thrive']);
  });

  it('quits a running profile and then removes it under --force', async () => {
    const fake = makeRunningFakeThorChrome(['thrive']);
    await expect(run(fake, ['delete', 'thrive', '--force'])).resolves.toBe(0);
    expect(fake.captured.stdout()).toBe(`Quit and deleted profile 'thrive' (PID 4242, ${fake.profilesDir}/thrive).\n`);
    expect(fake.killed).toStrictEqual([4_242]);
    expect(fs.existsSync(`${fake.profilesDir}/thrive`)).toBe(false);
  });

  it('reports what --force would quit and signals nothing under --dry-run', async () => {
    const fake = makeRunningFakeThorChrome(['thrive']);
    await expect(run(fake, ['delete', 'thrive', '--force', '--dry-run'])).resolves.toBe(0);
    expect(fake.captured.stdout()).toBe(
      `Would quit and delete profile 'thrive' (PID 4242, ${fake.profilesDir}/thrive).\n`,
    );
    expect(fake.killed).toStrictEqual([]);
  });

  it('keeps the profile when the forced quit fails', async () => {
    const fake = makeRunningFakeThorChrome(['thrive'], { isKillRefused: true });
    await expect(run(fake, ['delete', 'thrive', '--force'])).resolves.toBe(1);
    expect(fake.captured.stderr()).toBe("thor-chrome: could not signal PID 4242 for profile 'thrive'\n");
    expect(fs.existsSync(`${fake.profilesDir}/thrive`)).toBe(true);
  });

  it('refuses an invalid name before deleting any', async () => {
    const fake = makeFakeThorChrome();
    fake.makeProfile('thrive');
    await expect(run(fake, ['delete', 'thrive', '..'])).resolves.toBe(1);
    expect(fake.captured.stderr()).toContain("'.' and '..' do not name a profile");
    expect(fs.existsSync(`${fake.profilesDir}/thrive`)).toBe(true);
  });

  it('refuses a running profile under --dry-run without --force, as a real run would', async () => {
    const fake = makeRunningFakeThorChrome(['thrive']);
    await expect(run(fake, ['delete', 'thrive', '--dry-run'])).resolves.toBe(1);
    expect(fake.captured.stderr()).toContain("profile 'thrive' is running (PID 4242)");
    expect(fake.captured.stdout()).toBe('');
  });

  it("reports a running profile's refusal on its entry under --json and deletes the rest", async () => {
    const fake = makeRunningFakeThorChrome(['thrive']);
    fake.makeProfile('atlas');
    await expect(run(fake, ['delete', 'thrive', 'atlas', '--json'])).resolves.toBe(1);
    expect(fake.readReport()['profiles']).toMatchObject([
      { name: 'thrive', pid: 4_242, state: 'running-without-port', error: { code: 'profile-running' } },
      { name: 'atlas', state: 'deleted' },
    ]);
    expect(fake.captured.stderr()).toBe('');
  });

  it("reports the browser's PID on the entry of a profile that --force quit and deleted", async () => {
    const fake = makeRunningFakeThorChrome(['thrive']);
    await expect(run(fake, ['delete', 'thrive', '--force', '--json'])).resolves.toBe(0);
    expect(fake.readReport()).toStrictEqual({ profiles: [expect.objectContaining({ pid: 4_242, state: 'deleted' })] });
  });

  it('refuses a missing profile with profile-missing', async () => {
    const fake = makeFakeThorChrome();
    await expect(run(fake, ['delete', 'scratch', '--json'])).resolves.toBe(1);
    expect(fake.readReport()).toMatchObject({ profiles: [{ error: { code: 'profile-missing' } }] });
  });

  it('refuses with process-list-unavailable and removes nothing', async () => {
    const fake = makeFakeThorChrome({ results: { pgrep: { status: 3 } } });
    fake.makeProfile('thrive');
    await expect(run(fake, ['delete', 'thrive', '--json'])).resolves.toBe(1);
    expect(fake.readReport()).toMatchObject({ error: { code: 'process-list-unavailable' } });
    expect(fs.existsSync(`${fake.profilesDir}/thrive`)).toBe(true);
  });

  it('still reports a missing profile as missing when the process list is unreadable', async () => {
    const fake = makeFakeThorChrome({ results: { pgrep: { status: 3 } } });
    await expect(run(fake, ['delete', 'absent', '--json'])).resolves.toBe(1);
    expect(fake.readReport()).toMatchObject({ profiles: [{ error: { code: 'profile-missing' }, name: 'absent' }] });
  });

  it('refuses outside a repository with underived-profile when no profile is named', async () => {
    const fake = makeFakeThorChrome({ results: { 'git branch': { status: 128 }, 'git rev-parse': { status: 128 } } });
    await expect(run(fake, ['delete'])).resolves.toBe(1);
    expect(fake.captured.stderr()).toContain('    thor-chrome delete <repo>-<branch>\n');
  });

  describe('sweeps', () => {
    it('deletes the stale profiles under --stale and counts them, from outside a repository', async () => {
      const fake = makeFakeThorChrome({
        results: { 'git branch': { status: 128 }, 'git rev-parse': { status: 128 } },
      });
      fake.makeProfile('gone', { origin: 'derived', branch: '9', repo: 'widget', repo_dir: `${fake.home}/gone` });
      fake.makeProfile('named', { origin: 'named' });
      fake.makeProfile('unrecorded');
      await expect(run(fake, ['delete', '--stale'])).resolves.toBe(0);
      expect(fake.captured.stdout()).toBe(`Deleted profile 'gone' (${fake.profilesDir}/gone).\nDeleted 1 profile.\n`);
      expect(fs.readdirSync(fake.profilesDir)).toStrictEqual(['named', 'unrecorded']);
    });

    it('retains a running stale profile under --stale and deletes the rest', async () => {
      const fake = makeRunningFakeThorChrome(['widget-8']);
      fake.makeProfile('widget-8', goneRecord(fake, '8'));
      fake.makeProfile('widget-9', goneRecord(fake, '9'));
      await expect(run(fake, ['delete', '--stale'])).resolves.toBe(0);
      expect(fake.captured.stdout()).toBe(
        "Retained profile 'widget-8': running (PID 4242).\n" +
          `Deleted profile 'widget-9' (${fake.profilesDir}/widget-9).\n` +
          'Deleted 1 profile, retaining 1 profile.\n',
      );
      expect(fs.readdirSync(fake.profilesDir)).toStrictEqual(['widget-8']);
    });

    it('reports each stale profile and the total that it would delete under --dry-run, and removes nothing', async () => {
      const fake = makeFakeThorChrome();
      fake.makeProfile('widget-9', goneRecord(fake, '9'));
      await expect(run(fake, ['delete', '--stale', '--dry-run'])).resolves.toBe(0);
      expect(fake.captured.stdout()).toBe(
        `Would delete profile 'widget-9' (${fake.profilesDir}/widget-9).\nWould delete 1 profile.\n`,
      );
      expect(fs.existsSync(`${fake.profilesDir}/widget-9`)).toBe(true);
    });

    it.each([['--stale'], ['--all']])(
      'quits and deletes a running profile under %s --force, retaining nothing',
      async (selector) => {
        const fake = makeRunningFakeThorChrome(['widget-8']);
        fake.makeProfile('widget-8', goneRecord(fake, '8'));
        fake.makeProfile('widget-9', goneRecord(fake, '9'));
        await expect(run(fake, ['delete', selector, '--force'])).resolves.toBe(0);
        expect(fake.captured.stdout()).toBe(
          `Quit and deleted profile 'widget-8' (PID 4242, ${fake.profilesDir}/widget-8).\n` +
            `Deleted profile 'widget-9' (${fake.profilesDir}/widget-9).\n` +
            'Deleted 2 profiles.\n',
        );
        expect(fs.readdirSync(fake.profilesDir)).toStrictEqual([]);
      },
    );

    it("reports the browser's PID and port that --force would quit under --dry-run --json", async () => {
      const fake = makeFakeThorChrome({
        results: {
          pgrep: { stdout: '4242\n' },
          'ps -o command= -p 4242': { stdout: 'chrome --remote-debugging-port=9321\n' },
        },
      });
      fake.makeProfile('widget-9', goneRecord(fake, '9'));
      await expect(run(fake, ['delete', '--stale', '--force', '--dry-run', '--json'])).resolves.toBe(0);
      expect(fake.readReport()).toMatchObject({
        dryRun: true,
        profiles: [{ name: 'widget-9', pid: 4_242, port: 9_321, stale: true, state: 'deleted' }],
      });
      expect(fs.existsSync(`${fake.profilesDir}/widget-9`)).toBe(true);
    });

    it('deletes every profile under --all, retaining a running one', async () => {
      const fake = makeRunningFakeThorChrome(['thrive']);
      fake.makeProfile('atlas');
      fake.makeProfile('bravo');
      await expect(run(fake, ['delete', '--all'])).resolves.toBe(0);
      expect(fake.captured.stdout()).toContain("Retained profile 'thrive': running (PID 4242).\n");
      expect(fake.captured.stdout()).toMatch(/Deleted 2 profiles, retaining 1 profile\.\n$/);
    });

    it('names why it kept a profile under --json', async () => {
      const fake = makeRunningFakeThorChrome(['thrive']);
      await expect(run(fake, ['delete', '--all', '--json'])).resolves.toBe(0);
      expect(fake.readReport()['profiles']).toMatchObject([{ name: 'thrive', retained: 'running' }]);
    });

    it('counts a forced quit that failed', async () => {
      const fake = makeRunningFakeThorChrome(['thrive'], { isKillRefused: true });
      await expect(run(fake, ['delete', '--all', '--force', '--dry-run'])).resolves.toBe(0);
      await expect(run(fake, ['delete', '--all', '--force'])).resolves.toBe(1);
      expect(fake.captured.stdout()).toMatch(
        /Would delete 1 profile\.\n.*Deleted 0 profiles, failing to quit 1 profile\.\n$/s,
      );
    });

    it('reports that nothing was selected', async () => {
      const fake = makeFakeThorChrome();
      await run(fake, ['delete', '--stale']);
      await run(fake, ['delete', '--all']);
      await run(fake, ['delete', '--all', '--json']);
      expect(fake.captured.stdout()).toBe(`No stale profiles.\nNo profiles in ${fake.profilesDir}.\n{"profiles":[]}\n`);
    });

    it('reports an absent profiles directory as containing no profiles under --all', async () => {
      const fake = makeFakeThorChrome();
      fs.rmSync(fake.profilesDir, { recursive: true });
      await expect(run(fake, ['delete', '--all'])).resolves.toBe(0);
      expect(fake.captured.stdout()).toBe(`No profiles in ${fake.profilesDir}.\n`);
    });

    it('refuses the sweep with process-list-unavailable before deleting anything', async () => {
      const fake = makeFakeThorChrome({ results: { pgrep: { status: 3 } } });
      fake.makeProfile('thrive');
      await expect(run(fake, ['delete', '--all'])).resolves.toBe(1);
      expect(fake.captured.stderr()).toContain('the sweep deleted nothing');
      expect(fs.existsSync(`${fake.profilesDir}/thrive`)).toBe(true);
    });

    it('refuses the sweep under --dry-run as well when the process list is unreadable', async () => {
      const fake = makeFakeThorChrome({ results: { pgrep: { status: 3 } } });
      fake.makeProfile('thrive');
      await expect(run(fake, ['delete', '--all', '--dry-run'])).resolves.toBe(1);
      expect(fake.captured.stderr()).toContain('the sweep deleted nothing');
      expect(fake.captured.stdout()).toBe('');
    });
  });
});

describe('delete --derived', () => {
  it('removes the derived profile and leaves the named profile in THOR_CHROME_PROFILE', async () => {
    const fake = makeFakeThorChrome({ env: { THOR_CHROME_PROFILE: 'hq' } });
    fake.makeProfile('hq', { origin: 'named' });
    fake.makeProfile('widget-321', derivedRecord(fake));
    await expect(run(fake, ['delete', '--derived'])).resolves.toBe(0);
    expect(fs.readdirSync(fake.profilesDir)).toStrictEqual(['hq']);
    expect(fake.captured.stdout()).toBe(`Deleted profile 'widget-321' (${fake.profilesDir}/widget-321).\n`);
  });

  it('quits a running derived profile and then removes it under --force', async () => {
    const fake = makeRunningFakeThorChrome(['widget-321']);
    fake.makeProfile('widget-321', derivedRecord(fake));
    await expect(run(fake, ['delete', '--derived', '--force'])).resolves.toBe(0);
    expect(fake.killed).toStrictEqual([4_242]);
    expect(fs.existsSync(`${fake.profilesDir}/widget-321`)).toBe(false);
  });

  it.each([
    ['a named profile', (): Record<string, string> | undefined => ({ origin: 'named' })],
    ['an unrecorded profile', (): Record<string, string> | undefined => undefined],
    [
      'a profile derived from another repository',
      (fake: FakeThorChrome) => ({ ...derivedRecord(fake), repo_dir: `${fake.home}/elsewhere/widget` }),
    ],
    ['a profile derived from another branch', (fake: FakeThorChrome) => ({ ...derivedRecord(fake), branch: 'other' })],
  ])('refuses %s at the derived path with profile-not-derived and keeps it', async (_case, buildRecord) => {
    const fake = makeFakeThorChrome();
    fake.makeProfile('widget-321', buildRecord(fake));
    await expect(run(fake, ['delete', '--derived', '--force', '--json'])).resolves.toBe(1);
    expect(fake.readReport()['profiles']).toMatchObject([
      { error: { code: 'profile-not-derived' }, name: 'widget-321' },
    ]);
    expect(fs.existsSync(`${fake.profilesDir}/widget-321`)).toBe(true);
  });

  it('exits 0 when the worktree has no profile', async () => {
    const fake = makeFakeThorChrome({ env: { THOR_CHROME_PROFILE: 'hq' } });
    fake.makeProfile('hq', { origin: 'named' });
    await expect(run(fake, ['delete', '--derived', '--force'])).resolves.toBe(0);
    expect(fake.captured.stdout()).toBe(`No profile derived from this worktree (${fake.profilesDir}/widget-321).\n`);
    await expect(run(fake, ['delete', '--derived', '--json'])).resolves.toBe(0);
    expect(fake.captured.stdout()).toContain('{"profiles":[]}\n');
  });

  it('refuses outside a repository with underived-profile, ignoring THOR_CHROME_PROFILE', async () => {
    const fake = makeFakeThorChrome({
      env: { THOR_CHROME_PROFILE: 'hq' },
      results: { 'git branch': { status: 128 }, 'git rev-parse': { status: 128 } },
    });
    fake.makeProfile('hq', { origin: 'named' });
    await expect(run(fake, ['delete', '--derived', '--force'])).resolves.toBe(1);
    expect(fake.captured.stderr()).toContain('no repository or branch resolved from the working directory');
    expect(fs.existsSync(`${fake.profilesDir}/hq`)).toBe(true);
  });

  it.each([
    [
      ['delete', '--derived', 'thrive'],
      "--derived selects the profiles to delete, so it takes no profile name (got 'thrive')",
    ],
    [['delete', '--derived', '--all'], '--all and --derived each select a different set'],
    [['delete', '--derived', '--stale'], '--derived and --stale each select a different set'],
  ])('refuses %j with the usage message %j and status 2', async (args, message) => {
    const fake = makeFakeThorChrome();
    await expect(run(fake, ['--json', ...args])).resolves.toBe(2);
    expect(fake.readReport()).toStrictEqual({ error: { code: 'usage', message } });
  });
});

// region | Helpers

/** Returns the record that a launch in the fake's working repository leaves on its derived profile. */
function derivedRecord(fake: FakeThorChrome): Record<string, string> {
  return { origin: 'derived', branch: '321', repo: 'widget', repo_dir: fake.workRepoDir };
}

/** Returns the record of a profile derived from a repository that is gone, which makes it stale. */
function goneRecord(fake: FakeThorChrome, branch: string): Record<string, string> {
  return { origin: 'derived', branch, repo: 'widget', repo_dir: `${fake.home}/gone` };
}

/** Runs thor-chrome against the fake. */
function run(fake: FakeThorChrome, args: string[]): Promise<number> {
  return runThorChrome(args, fake.captured.output, fake.deps);
}

// endregion | Helpers
