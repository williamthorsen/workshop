import { describe, expect, it } from 'vitest';

import { type FakeThorChrome, makeFakeThorChrome, makeRunningFakeThorChrome } from '../test-utils/fake-thor-chrome.ts';
import { runThorChrome } from '../thor-chrome.ts';

describe('quit', () => {
  it('reports a profile that is not running, once however often it is named', async () => {
    const fake = makeFakeThorChrome();
    fake.makeProfile('thrive');
    await expect(run(fake, ['quit', 'thrive', 'thrive'])).resolves.toBe(0);
    expect(fake.captured.stdout()).toBe("Profile 'thrive' is not running.\n");
    expect(fake.killed).toStrictEqual([]);
  });

  it("signals the profile's browser and waits for it to exit", async () => {
    const fake = makeRunningFakeThorChrome(['thrive']);
    await expect(run(fake, ['quit', 'thrive'])).resolves.toBe(0);
    expect(fake.captured.stdout()).toBe("Quit profile 'thrive' (PID 4242).\n");
    expect(fake.killed).toStrictEqual([4_242]);
  });

  it("leaves another profile's browser running", async () => {
    const fake = makeRunningFakeThorChrome(['atlas']);
    fake.makeProfile('thrive');
    await expect(run(fake, ['quit', 'thrive'])).resolves.toBe(0);
    expect(fake.captured.stdout()).toBe("Profile 'thrive' is not running.\n");
    expect(fake.killed).toStrictEqual([]);
  });

  it('quits every profile that it names, reporting each on its own line', async () => {
    const fake = makeRunningFakeThorChrome(['thrive', 'atlas']);
    await expect(run(fake, ['quit', 'thrive', 'atlas'])).resolves.toBe(0);
    expect(fake.captured.stdout()).toBe("Quit profile 'thrive' (PID 4242).\nQuit profile 'atlas' (PID 4243).\n");
  });

  it('quits the profile derived from the branch when none is named', async () => {
    const fake = makeFakeThorChrome();
    fake.makeProfile('widget-321');
    await expect(run(fake, ['quit'])).resolves.toBe(0);
    expect(fake.captured.stdout()).toBe("Profile 'widget-321' is not running.\n");
  });

  it('reports a null PID under --json for a profile that was not running', async () => {
    const fake = makeFakeThorChrome();
    fake.makeProfile('thrive');
    await expect(run(fake, ['quit', 'thrive', '--json'])).resolves.toBe(0);
    expect(fake.readReport()).toMatchObject({ profiles: [{ name: 'thrive', pid: null, state: 'stopped' }] });
  });

  it('reports the process that it ended under --json', async () => {
    const fake = makeRunningFakeThorChrome(['thrive']);
    await expect(run(fake, ['quit', 'thrive', '--json'])).resolves.toBe(0);
    expect(fake.readReport()).toMatchObject({
      profiles: [{ name: 'thrive', pid: 4_242, state: 'stopped' }],
    });
  });

  it('quits every running profile under --all, or says that none is running', async () => {
    const fake = makeRunningFakeThorChrome(['thrive']);
    fake.makeProfile('atlas');
    await expect(run(fake, ['quit', '--all'])).resolves.toBe(0);
    expect(fake.captured.stdout()).toBe("Quit profile 'thrive' (PID 4242).\n");

    const idle = makeFakeThorChrome();
    idle.makeProfile('thrive');
    await run(idle, ['quit', '--all']);
    await run(idle, ['quit', '--all', '--json']);
    expect(idle.captured.stdout()).toBe('No running profiles.\n{"profiles":[]}\n');
  });

  it('refuses a missing profile and processes the rest, exiting 1', async () => {
    const fake = makeFakeThorChrome();
    fake.makeProfile('thrive');
    await expect(run(fake, ['quit', 'scratch', 'thrive'])).resolves.toBe(1);
    expect(fake.captured.stdout()).toBe("Profile 'thrive' is not running.\n");
    expect(fake.captured.stderr()).toBe(
      `thor-chrome: profile 'scratch' does not exist at ${fake.profilesDir}/scratch\n  List existing profiles: thor-chrome list\n`,
    );
  });

  it("reports a refused profile's error on its entry under --json", async () => {
    const fake = makeFakeThorChrome();
    fake.makeProfile('thrive');
    await expect(run(fake, ['quit', 'scratch', 'thrive', '--json'])).resolves.toBe(1);
    expect(fake.readReport()['profiles']).toMatchObject([
      { error: { code: 'profile-missing' }, name: 'scratch' },
      { name: 'thrive', state: 'stopped' },
    ]);
  });

  it('refuses with quit-failed when the browser cannot be signalled', async () => {
    const fake = makeRunningFakeThorChrome(['thrive'], { isKillRefused: true });
    await expect(run(fake, ['quit', 'thrive'])).resolves.toBe(1);
    expect(fake.captured.stderr()).toBe("thor-chrome: could not signal PID 4242 for profile 'thrive'\n");
  });

  it('refuses with quit-timeout when the browser outlives the budget', async () => {
    const fake = makeFakeThorChrome({
      env: { THOR_CHROME_QUIT_TIMEOUT: '1' },
      results: { pgrep: { stdout: '4242\n' }, 'ps -o command= -p 4242': { stdout: 'chrome\n' } },
    });
    fake.makeProfile('thrive');
    await expect(run(fake, ['quit', 'thrive', '--json'])).resolves.toBe(1);
    expect(fake.readReport()).toMatchObject({
      profiles: [
        {
          error: {
            code: 'quit-timeout',
            message: "PID 4242 for profile 'thrive' is still running 1s after SIGTERM; end it manually",
          },
        },
      ],
    });
  });

  it('refuses with invalid-timeout for a quit budget that is not whole seconds', async () => {
    const fake = makeFakeThorChrome({ env: { THOR_CHROME_QUIT_TIMEOUT: '0' } });
    await expect(run(fake, ['quit', 'thrive'])).resolves.toBe(1);
    expect(fake.captured.stderr()).toBe(
      'thor-chrome: invalid THOR_CHROME_QUIT_TIMEOUT: 0 (whole seconds, 1 or more)\n',
    );
  });

  it('refuses the invocation with process-list-unavailable, for a named profile and for --all', async () => {
    const fake = makeFakeThorChrome({ results: { pgrep: { status: 3 } } });
    fake.makeProfile('thrive');
    await expect(run(fake, ['quit', 'thrive', '--json'])).resolves.toBe(1);
    expect(fake.readReport()).toMatchObject({
      error: { code: 'process-list-unavailable' },
      profile: { name: 'thrive', state: 'unknown' },
    });

    const all = makeFakeThorChrome({ results: { pgrep: { status: 3 } } });
    all.makeProfile('thrive');
    await expect(run(all, ['quit', '--all', '--json'])).resolves.toBe(1);
    expect(all.captured.stdout()).toBe(
      `{"error":{"code":"process-list-unavailable","message":"could not read the process list, so no profile's state is known and nothing was quit"}}\n`,
    );
  });

  it('refuses outside a repository with underived-profile when no profile is named', async () => {
    const fake = makeFakeThorChrome({ results: { 'git branch': { status: 128 }, 'git rev-parse': { status: 128 } } });
    await expect(run(fake, ['quit'])).resolves.toBe(1);
    expect(fake.captured.stderr()).toContain('    thor-chrome quit <repo>-<branch>\n');
  });

  it('refuses an invalid name before acting on any', async () => {
    const fake = makeRunningFakeThorChrome(['thrive']);
    await expect(run(fake, ['quit', 'thrive', '..'])).resolves.toBe(1);
    expect(fake.killed).toStrictEqual([]);
  });
});

// region | Helpers

/** Runs thor-chrome against the fake. */
function run(fake: FakeThorChrome, args: string[]): Promise<number> {
  return runThorChrome(args, fake.captured.output, fake.deps);
}

// endregion | Helpers
