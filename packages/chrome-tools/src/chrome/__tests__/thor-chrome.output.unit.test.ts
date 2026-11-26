import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { INSTANCE_PAGE_FILE } from '../instance-page.ts';
import { type FakeThorChrome, makeFakeThorChrome } from '../test-utils/fake-thor-chrome.ts';
import { makeLaunchFake, makeRunningFake } from '../test-utils/launch-fixtures.ts';
import { transcribe, transcribeBoth } from '../test-utils/transcribe.ts';
import { formatUsage } from '../usage.ts';

// Each case records the exit status, both streams, and the order of their writes, in prose and under --json
describe('thor-chrome output', () => {
  it('prints usage on stdout alone for --help before and after a verb', async () => {
    const fake = makeFakeThorChrome();
    const before = await transcribe(fake, ['--help', 'list']);
    const after = await transcribe(fake, ['list', '--help']);
    expect(after).toBe(before.replace('$ --help list', '$ list --help'));
    const usage = formatUsage('thor-chrome', fake.profilesDir).replaceAll(fake.home, '<home>');
    expect(before).toBe(
      ['$ --help list', 'exit 0', `--- stdout\n${usage}`, '--- stderr\n', `--- combined\n${usage}`].join('\n'),
    );
  });

  describe('list', () => {
    it('reports a missing profiles directory', async () => {
      const fake = makeFakeThorChrome();
      fs.rmSync(fake.profilesDir, { recursive: true });
      await expect(transcribeBoth(fake, ['list'])).resolves.toMatchInlineSnapshot(`
        "$ list
        exit 0
        --- stdout
        No profiles: <home>/.local/share/thor-chrome/profiles does not exist.

        --- stderr

        --- combined
        No profiles: <home>/.local/share/thor-chrome/profiles does not exist.

        $ list --json
        exit 0
        --- stdout
        {"profiles":[]}

        --- stderr

        --- combined
        {"profiles":[]}
        "
      `);
    });

    it('reports profiles in mixed states and provenance', async () => {
      const fake = makeFakeThorChrome({
        results: {
          [`pgrep -f user-data-dir=PROFILES/atlas( |$)`]: { stdout: '11\n' },
          'ps -o command= -p 11': { stdout: 'chrome --remote-debugging-port=9333 --headless\n' },
        },
      });
      rewritePatterns(fake);
      fake.makeProfile('atlas', { origin: 'named' });
      fake.makeProfile('bravo');
      fake.makeProfile('widget-9', { origin: 'derived', branch: '9', repo: 'widget', repo_dir: `${fake.home}/gone` });
      await expect(transcribeBoth(fake, ['list'])).resolves.toMatchInlineSnapshot(`
        "$ list
        exit 0
        --- stdout
          PASS  atlas: debugging headless on port 9333 (PID 11), last used 2026-01-02
          INFO  bravo: stopped, last used 2026-01-02, unrecorded
          INFO  widget-9: stopped, port 20009, last used 2026-01-02, stale: repository <home>/gone is gone

        --- stderr

        --- combined
          PASS  atlas: debugging headless on port 9333 (PID 11), last used 2026-01-02
          INFO  bravo: stopped, last used 2026-01-02, unrecorded
          INFO  widget-9: stopped, port 20009, last used 2026-01-02, stale: repository <home>/gone is gone

        $ list --json
        exit 0
        --- stdout
        {"profiles":[{"name":"atlas","path":"<home>/.local/share/thor-chrome/profiles/atlas","state":"debugging","headless":true,"pid":11,"port":9333,"derivedPort":null,"devtools":"http://127.0.0.1:9333/json/version","origin":"named","repo":null,"branch":null,"stale":false,"lastUsedAt":"2026-01-02T12:00:00Z"},{"name":"bravo","path":"<home>/.local/share/thor-chrome/profiles/bravo","state":"stopped","headless":null,"pid":null,"port":null,"derivedPort":null,"devtools":null,"origin":null,"repo":null,"branch":null,"stale":null,"lastUsedAt":"2026-01-02T12:00:00Z"},{"name":"widget-9","path":"<home>/.local/share/thor-chrome/profiles/widget-9","state":"stopped","headless":null,"pid":null,"port":null,"derivedPort":20009,"devtools":null,"origin":"derived","repo":"widget","branch":"9","stale":true,"lastUsedAt":"2026-01-02T12:00:00Z"}]}

        --- stderr

        --- combined
        {"profiles":[{"name":"atlas","path":"<home>/.local/share/thor-chrome/profiles/atlas","state":"debugging","headless":true,"pid":11,"port":9333,"derivedPort":null,"devtools":"http://127.0.0.1:9333/json/version","origin":"named","repo":null,"branch":null,"stale":false,"lastUsedAt":"2026-01-02T12:00:00Z"},{"name":"bravo","path":"<home>/.local/share/thor-chrome/profiles/bravo","state":"stopped","headless":null,"pid":null,"port":null,"derivedPort":null,"devtools":null,"origin":null,"repo":null,"branch":null,"stale":null,"lastUsedAt":"2026-01-02T12:00:00Z"},{"name":"widget-9","path":"<home>/.local/share/thor-chrome/profiles/widget-9","state":"stopped","headless":null,"pid":null,"port":null,"derivedPort":20009,"devtools":null,"origin":"derived","repo":"widget","branch":"9","stale":true,"lastUsedAt":"2026-01-02T12:00:00Z"}]}
        "
      `);
      await expect(transcribeBoth(fake, ['list', '--stale'])).resolves.toMatchInlineSnapshot(`
        "$ list --stale
        exit 0
        --- stdout
          INFO  widget-9: stopped, port 20009, last used 2026-01-02, stale: repository <home>/gone is gone

        --- stderr

        --- combined
          INFO  widget-9: stopped, port 20009, last used 2026-01-02, stale: repository <home>/gone is gone

        $ list --stale --json
        exit 0
        --- stdout
        {"profiles":[{"name":"widget-9","path":"<home>/.local/share/thor-chrome/profiles/widget-9","state":"stopped","headless":null,"pid":null,"port":null,"derivedPort":20009,"devtools":null,"origin":"derived","repo":"widget","branch":"9","stale":true,"lastUsedAt":"2026-01-02T12:00:00Z"}]}

        --- stderr

        --- combined
        {"profiles":[{"name":"widget-9","path":"<home>/.local/share/thor-chrome/profiles/widget-9","state":"stopped","headless":null,"pid":null,"port":null,"derivedPort":20009,"devtools":null,"origin":"derived","repo":"widget","branch":"9","stale":true,"lastUsedAt":"2026-01-02T12:00:00Z"}]}
        "
      `);
    });

    it('warns when the process list is unreadable', async () => {
      const fake = makeFakeThorChrome({ results: { pgrep: { status: 3 } } });
      fake.makeProfile('thrive', { origin: 'named' });
      await expect(transcribeBoth(fake, ['list'])).resolves.toMatchInlineSnapshot(`
        "$ list
        exit 0
        --- stdout
          WARN  thrive: state unknown, last used 2026-01-02

        --- stderr
        thor-chrome: could not read the process list, so the reported state is unknown rather than stopped
          Run thor-chrome list from a terminal outside the sandbox.

        --- combined
          WARN  thrive: state unknown, last used 2026-01-02
        thor-chrome: could not read the process list, so the reported state is unknown rather than stopped
          Run thor-chrome list from a terminal outside the sandbox.

        $ list --json
        exit 0
        --- stdout
        {"profiles":[{"name":"thrive","path":"<home>/.local/share/thor-chrome/profiles/thrive","state":"unknown","headless":null,"pid":null,"port":null,"derivedPort":null,"devtools":null,"origin":"named","repo":null,"branch":null,"stale":false,"lastUsedAt":"2026-01-02T12:00:00Z"}]}

        --- stderr

        --- combined
        {"profiles":[{"name":"thrive","path":"<home>/.local/share/thor-chrome/profiles/thrive","state":"unknown","headless":null,"pid":null,"port":null,"derivedPort":null,"devtools":null,"origin":"named","repo":null,"branch":null,"stale":false,"lastUsedAt":"2026-01-02T12:00:00Z"}]}
        "
      `);
    });
  });

  describe('status', () => {
    it('reports a running headless profile and its endpoint', async () => {
      const fake = makeRunningFake({ isHeadless: true, port: '9333' });
      await expect(transcribeBoth(fake, ['status', 'thrive'])).resolves.toMatchInlineSnapshot(`
        "$ status thrive
        exit 0
        --- stdout
        thrive: debugging (headless), endpoint http://127.0.0.1:9333

        --- stderr

        --- combined
        thrive: debugging (headless), endpoint http://127.0.0.1:9333

        $ status thrive --json
        exit 0
        --- stdout
        {"profile":{"name":"thrive","path":"<home>/.local/share/thor-chrome/profiles/thrive","state":"debugging","headless":true,"pid":4242,"port":9333,"derivedPort":null,"devtools":"http://127.0.0.1:9333/json/version","origin":null,"repo":null,"branch":null,"stale":null,"lastUsedAt":"2026-01-02T12:00:00Z"},"endpoint":"http://127.0.0.1:9333"}

        --- stderr

        --- combined
        {"profile":{"name":"thrive","path":"<home>/.local/share/thor-chrome/profiles/thrive","state":"debugging","headless":true,"pid":4242,"port":9333,"derivedPort":null,"devtools":"http://127.0.0.1:9333/json/version","origin":null,"repo":null,"branch":null,"stale":null,"lastUsedAt":"2026-01-02T12:00:00Z"},"endpoint":"http://127.0.0.1:9333"}
        "
      `);
    });

    it('warns when the state is unknown', async () => {
      const fake = makeLaunchFake({ results: { pgrep: { status: 3 } } });
      await expect(transcribeBoth(fake, ['status', 'thrive'])).resolves.toMatchInlineSnapshot(`
        "$ status thrive
        exit 0
        --- stdout
        thrive: unknown, endpoint http://127.0.0.1:20321

        --- stderr
        thor-chrome: could not read the process list, so the reported state is unknown rather than stopped
          Run thor-chrome status from a terminal outside the sandbox.

        --- combined
        thrive: unknown, endpoint http://127.0.0.1:20321
        thor-chrome: could not read the process list, so the reported state is unknown rather than stopped
          Run thor-chrome status from a terminal outside the sandbox.

        $ status thrive --json
        exit 0
        --- stdout
        {"profile":{"name":"thrive","path":"<home>/.local/share/thor-chrome/profiles/thrive","state":"unknown","headless":null,"pid":null,"port":null,"derivedPort":null,"devtools":null,"origin":null,"repo":null,"branch":null,"stale":null,"lastUsedAt":"2026-01-02T12:00:00Z"},"endpoint":"http://127.0.0.1:20321"}

        --- stderr

        --- combined
        {"profile":{"name":"thrive","path":"<home>/.local/share/thor-chrome/profiles/thrive","state":"unknown","headless":null,"pid":null,"port":null,"derivedPort":null,"devtools":null,"origin":null,"repo":null,"branch":null,"stale":null,"lastUsedAt":"2026-01-02T12:00:00Z"},"endpoint":"http://127.0.0.1:20321"}
        "
      `);
    });
  });

  describe('show-instance-page', () => {
    it('opens the instance page of a debugging profile', async () => {
      const fake = makeRunningFake({ port: '9333' });
      fs.writeFileSync(`${fake.profilesDir}/thrive/${INSTANCE_PAGE_FILE}`, '<html></html>\n');
      await expect(transcribeBoth(fake, ['show-instance-page', 'thrive'])).resolves.toMatchInlineSnapshot(`
        "$ show-instance-page thrive
        exit 0
        --- stdout
        Opened the instance page of 'thrive' on port 9333.

        --- stderr

        --- combined
        Opened the instance page of 'thrive' on port 9333.

        $ show-instance-page thrive --json
        exit 0
        --- stdout
        {"profile":{"name":"thrive","path":"<home>/.local/share/thor-chrome/profiles/thrive","state":"debugging","headless":false,"pid":4242,"port":9333,"derivedPort":null,"devtools":"http://127.0.0.1:9333/json/version","origin":null,"repo":null,"branch":null,"stale":null,"lastUsedAt":"2026-01-02T12:00:00Z"},"page":"<home>/.local/share/thor-chrome/profiles/thrive/thor-chrome.html"}

        --- stderr

        --- combined
        {"profile":{"name":"thrive","path":"<home>/.local/share/thor-chrome/profiles/thrive","state":"debugging","headless":false,"pid":4242,"port":9333,"derivedPort":null,"devtools":"http://127.0.0.1:9333/json/version","origin":null,"repo":null,"branch":null,"stale":null,"lastUsedAt":"2026-01-02T12:00:00Z"},"page":"<home>/.local/share/thor-chrome/profiles/thrive/thor-chrome.html"}
        "
      `);
    });
  });

  describe('launch', () => {
    it('reports the command that a dry run would start', async () => {
      await expect(transcribeBoth(makeLaunchFake(), ['--profile', 'thrive', '--dry-run'])).resolves
        .toMatchInlineSnapshot(`
        "$ --profile thrive --dry-run
        exit 0
        --- stdout
        /bin/sh --remote-debugging-port=0 --user-data-dir=<home>/.local/share/thor-chrome/profiles/thrive --disable-search-engine-choice-screen --hide-crash-restore-bubble --no-default-browser-check --no-first-run --no-startup-window
        Opens: about:blank
        Opens: file://<home>/.local/share/thor-chrome/profiles/thrive/thor-chrome.html

        --- stderr

        --- combined
        /bin/sh --remote-debugging-port=0 --user-data-dir=<home>/.local/share/thor-chrome/profiles/thrive --disable-search-engine-choice-screen --hide-crash-restore-bubble --no-default-browser-check --no-first-run --no-startup-window
        Opens: about:blank
        Opens: file://<home>/.local/share/thor-chrome/profiles/thrive/thor-chrome.html

        $ --profile thrive --dry-run --json
        exit 0
        --- stdout
        {"command":["/bin/sh","--remote-debugging-port=0","--user-data-dir=<home>/.local/share/thor-chrome/profiles/thrive","--disable-search-engine-choice-screen","--hide-crash-restore-bubble","--no-default-browser-check","--no-first-run","--no-startup-window"],"pages":["about:blank","file://<home>/.local/share/thor-chrome/profiles/thrive/thor-chrome.html"],"dryRun":true}

        --- stderr

        --- combined
        {"command":["/bin/sh","--remote-debugging-port=0","--user-data-dir=<home>/.local/share/thor-chrome/profiles/thrive","--disable-search-engine-choice-screen","--hide-crash-restore-bubble","--no-default-browser-check","--no-first-run","--no-startup-window"],"pages":["about:blank","file://<home>/.local/share/thor-chrome/profiles/thrive/thor-chrome.html"],"dryRun":true}
        "
      `);
    });

    it('reports that a dry run against a running profile starts nothing', async () => {
      const fake = makeRunningFake({ port: '9333' });
      await expect(transcribeBoth(fake, ['--profile', 'thrive', '--port', '9333', '--dry-run'])).resolves
        .toMatchInlineSnapshot(`
        "$ --profile thrive --port 9333 --dry-run
        exit 0
        --- stdout
        profile 'thrive' is running on port 9333

        --- stderr

        --- combined
        profile 'thrive' is running on port 9333

        $ --profile thrive --port 9333 --dry-run --json
        exit 0
        --- stdout
        {"command":null,"pages":[],"dryRun":true}

        --- stderr

        --- combined
        {"command":null,"pages":[],"dryRun":true}
        "
      `);
    });

    it('reports a started launch', async () => {
      await expect(transcribeBoth(makeLaunchFake(), ['--profile', 'thrive', '--port', '9333'])).resolves
        .toMatchInlineSnapshot(`
        "$ --profile thrive --port 9333
        exit 0
        --- stdout
        chrome: profile 'thrive' on port 9333
        DevTools: http://127.0.0.1:9333/json/version

        --- stderr

        --- combined
        chrome: profile 'thrive' on port 9333
        DevTools: http://127.0.0.1:9333/json/version

        $ --profile thrive --port 9333 --json
        exit 0
        --- stdout
        {"profile":{"name":"thrive","path":"<home>/.local/share/thor-chrome/profiles/thrive","state":"debugging","headless":false,"pid":5150,"port":9333,"derivedPort":null,"devtools":"http://127.0.0.1:9333/json/version","origin":"named","repo":null,"branch":null,"stale":false,"lastUsedAt":"2026-01-02T12:00:00Z"},"browser":"chrome"}

        --- stderr

        --- combined
        {"profile":{"name":"thrive","path":"<home>/.local/share/thor-chrome/profiles/thrive","state":"debugging","headless":false,"pid":5150,"port":9333,"derivedPort":null,"devtools":"http://127.0.0.1:9333/json/version","origin":"named","repo":null,"branch":null,"stale":false,"lastUsedAt":"2026-01-02T12:00:00Z"},"browser":"chrome"}
        "
      `);
    });
  });

  describe('refusal of the whole invocation', () => {
    it('reports the resolved profile beside the error', async () => {
      const make = () => makeLaunchFake({ results: { pgrep: { status: 3 } } });
      await expect(transcribe(make(), ['quit', 'thrive'])).resolves.toMatchInlineSnapshot(`
        "$ quit thrive
        exit 1
        --- stdout

        --- stderr
        thor-chrome: could not read the process list, so the state of profile 'thrive' is unknown
          Run this command from a terminal outside the sandbox.

        --- combined
        thor-chrome: could not read the process list, so the state of profile 'thrive' is unknown
          Run this command from a terminal outside the sandbox.
        "
      `);
      await expect(transcribe(make(), ['quit', 'thrive', '--json'])).resolves.toMatchInlineSnapshot(`
        "$ quit thrive --json
        exit 1
        --- stdout
        {"error":{"code":"process-list-unavailable","message":"could not read the process list, so the state of profile 'thrive' is unknown"},"profile":{"name":"thrive","path":"<home>/.local/share/thor-chrome/profiles/thrive","state":"unknown","headless":null,"pid":null,"port":null,"derivedPort":null,"devtools":null,"origin":null,"repo":null,"branch":null,"stale":null,"lastUsedAt":"2026-01-02T12:00:00Z"}}

        --- stderr

        --- combined
        {"error":{"code":"process-list-unavailable","message":"could not read the process list, so the state of profile 'thrive' is unknown"},"profile":{"name":"thrive","path":"<home>/.local/share/thor-chrome/profiles/thrive","state":"unknown","headless":null,"pid":null,"port":null,"derivedPort":null,"devtools":null,"origin":null,"repo":null,"branch":null,"stale":null,"lastUsedAt":"2026-01-02T12:00:00Z"}}
        "
      `);
    });

    it('reports a usage error', async () => {
      await expect(transcribeBoth(makeFakeThorChrome(), ['frobnicate'])).resolves.toMatchInlineSnapshot(`
        "$ frobnicate
        exit 2
        --- stdout

        --- stderr
        thor-chrome: unknown command 'frobnicate'
        Try 'thor-chrome --help'.

        --- combined
        thor-chrome: unknown command 'frobnicate'
        Try 'thor-chrome --help'.

        $ frobnicate --json
        exit 2
        --- stdout
        {"error":{"code":"usage","message":"unknown command 'frobnicate'"}}

        --- stderr

        --- combined
        {"error":{"code":"usage","message":"unknown command 'frobnicate'"}}
        "
      `);
    });
  });
});

// region | Helpers

/** Replaces the profiles directory in the fake's pgrep patterns with PROFILES, so that answers can be keyed by name. */
function rewritePatterns(fake: FakeThorChrome): void {
  const { run } = fake.deps;
  const escaped = fake.profilesDir.replaceAll('.', String.raw`\.`);
  fake.deps.run = (program, args, options) =>
    run(
      program,
      args.map((argument) => argument.replace(escaped, 'PROFILES')),
      options,
    );
}

// endregion | Helpers
