import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { type FakeThorChrome, makeFakeThorChrome } from '../test-utils/fake-thor-chrome.ts';
import { runThorChrome } from '../thor-chrome.ts';

// Noon UTC falls on the same date in every zone from UTC-11 to UTC+11
const LAST_USED = new Date('2026-01-02T12:00:00Z');

describe('list', () => {
  it('reports each profile with its state, last use, and provenance, in name order', async () => {
    const fake = makeFakeThorChrome({
      results: {
        'pgrep -f user-data-dir=PROFILES/atlas': { stdout: '11\n' },
        'pgrep -f user-data-dir=PROFILES/bravo': { stdout: '12\n' },
        'pgrep -f user-data-dir=PROFILES/charlie': { stdout: '13\n' },
        'ps -o command= -p 11': { stdout: 'chrome --remote-debugging-port=9333\n' },
        'ps -o command= -p 12': { stdout: 'chrome\n' },
        'ps -o command= -p 13': { stdout: 'chrome --remote-debugging-port=9444\n' },
        'curl --silent --fail --max-time 1 http://127.0.0.1:9444': { status: 7 },
      },
    });
    rewritePatterns(fake);
    for (const name of ['delta', 'charlie', 'bravo', 'atlas']) makeFrozenProfile(fake, name, { origin: 'named' });
    await expect(run(fake, ['list'])).resolves.toBe(0);
    expect(fake.captured.stdout()).toBe(
      [
        '  PASS  atlas: debugging on port 9333 (PID 11), last used 2026-01-02',
        '  WARN  bravo: running (PID 12), no debugging port, last used 2026-01-02',
        '  WARN  charlie: running (PID 13), port 9444 not answering, last used 2026-01-02',
        '  INFO  delta: stopped, last used 2026-01-02',
        '',
      ].join('\n'),
    );
  });

  it('marks an unrecorded profile and a stale one, naming what is gone', async () => {
    const fake = makeFakeThorChrome();
    makeFrozenProfile(fake, 'thrive');
    makeFrozenProfile(fake, 'widget-9', {
      origin: 'derived',
      branch: '9',
      repo: 'widget',
      repo_dir: `${fake.home}/gone`,
    });
    await expect(run(fake, ['list'])).resolves.toBe(0);
    expect(fake.captured.stdout()).toBe(
      '  INFO  thrive: stopped, last used 2026-01-02, unrecorded\n' +
        `  INFO  widget-9: stopped, last used 2026-01-02, stale: repository ${fake.home}/gone is gone\n`,
    );
  });

  it('lists only stale profiles under --stale, or says that none is', async () => {
    const fake = makeFakeThorChrome();
    makeFrozenProfile(fake, 'thrive', { origin: 'named' });
    await expect(run(fake, ['list', '--stale'])).resolves.toBe(0);
    expect(fake.captured.stdout()).toBe('No stale profiles.\n');
  });

  it('lists only the profiles whose branch or repository is gone under --stale, in prose and under --json', async () => {
    const fake = makeFakeWithBranches(['321']);
    makeFrozenProfile(fake, 'scratch', { origin: 'named' });
    makeFrozenProfile(fake, 'widget-321', derivedRecord(fake, '321'));
    makeFrozenProfile(fake, 'widget-9', derivedRecord(fake, '9'));
    await expect(run(fake, ['list', '--stale'])).resolves.toBe(0);
    await expect(run(fake, ['list', '--stale', '--json'])).resolves.toBe(0);
    expect(fake.captured.stdout()).toBe(
      "  INFO  widget-9: stopped, last used 2026-01-02, stale: branch '9' is gone\n" +
        `{"profiles":[{"name":"widget-9","path":"${fake.profilesDir}/widget-9","state":"stopped","pid":null,"port":null,` +
        '"devtools":null,"origin":"derived","repo":"widget","branch":"9","stale":true,"lastUsedAt":"2026-01-02T12:00:00Z"}]}\n',
    );
    expect(fs.existsSync(`${fake.profilesDir}/widget-9`)).toBe(true);
  });

  it('reports an empty list under --stale --json when no profile is stale', async () => {
    const fake = makeFakeWithBranches(['321']);
    makeFrozenProfile(fake, 'widget-321', derivedRecord(fake, '321'));
    await expect(run(fake, ['list', '--stale', '--json'])).resolves.toBe(0);
    expect(fake.captured.stdout()).toBe('{"profiles":[]}\n');
  });

  it.each([
    [
      'a debugging profile with its port and endpoint',
      '9333',
      0,
      { state: 'debugging', pid: 4_242, port: 9_333, devtools: 'http://127.0.0.1:9333/json/version' },
    ],
    [
      'a running profile that owns no port',
      undefined,
      0,
      { state: 'running-without-port', pid: 4_242, port: null, devtools: null },
    ],
    [
      'a declared port that does not answer, without an endpoint',
      '9321',
      7,
      { state: 'unresponsive', pid: 4_242, port: 9_321, devtools: null },
    ],
  ])('reports %s under --json', async (_description, port, curlStatus, expected) => {
    const portFlag = port === undefined ? '' : ` --remote-debugging-port=${port}`;
    const fake = makeFakeThorChrome({
      results: {
        pgrep: { stdout: '4242\n' },
        'ps -o command= -p 4242': { stdout: `chrome${portFlag}\n` },
        curl: { status: curlStatus },
      },
    });
    makeFrozenProfile(fake, 'thrive', { origin: 'named' });
    await expect(run(fake, ['list', '--json'])).resolves.toBe(0);
    expect(fake.readReport()['profiles']).toMatchObject([{ name: 'thrive', ...expected }]);
  });

  it('reports every profile as one JSON document', async () => {
    const fake = makeFakeThorChrome();
    makeFrozenProfile(fake, 'thrive', { origin: 'named' });
    await expect(run(fake, ['list', '--json'])).resolves.toBe(0);
    expect(fake.captured.stdout()).toBe(
      `{"profiles":[{"name":"thrive","path":"${fake.profilesDir}/thrive","state":"stopped","pid":null,"port":null,` +
        '"devtools":null,"origin":"named","repo":null,"branch":null,"stale":false,"lastUsedAt":"2026-01-02T12:00:00Z"}]}\n',
    );
  });

  it('reports an absent profiles directory as a sentence, or as an empty list under --json', async () => {
    const fake = makeFakeThorChrome();
    fs.rmSync(fake.profilesDir, { recursive: true });
    await run(fake, ['list']);
    await run(fake, ['list', '--json']);
    expect(fake.captured.stdout()).toBe(`No profiles: ${fake.profilesDir} does not exist.\n{"profiles":[]}\n`);
  });

  it('reports an empty profiles directory', async () => {
    const fake = makeFakeThorChrome();
    await run(fake, ['list']);
    expect(fake.captured.stdout()).toBe(`No profiles in ${fake.profilesDir}.\n`);
  });

  it('reports every state as unknown and names the cause when the process list is unreadable', async () => {
    const fake = makeFakeThorChrome({ results: { pgrep: { status: 3 } } });
    makeFrozenProfile(fake, 'thrive', { origin: 'named' });
    await expect(run(fake, ['list'])).resolves.toBe(0);
    expect(fake.captured.stdout()).toBe('  WARN  thrive: state unknown, last used 2026-01-02\n');
    expect(fake.captured.stderr()).toBe(
      'thor-chrome: could not read the process list, so the reported state is unknown rather than stopped\n' +
        '  Run thor-chrome list from a terminal outside the sandbox.\n',
    );
  });

  it('lists a stale profile as unknown, keeping the stale mark, when the process list is unreadable', async () => {
    const fake = makeFakeWithBranches(['321'], { pgrep: { status: 3 } });
    makeFrozenProfile(fake, 'widget-9', derivedRecord(fake, '9'));
    await expect(run(fake, ['list', '--stale'])).resolves.toBe(0);
    expect(fake.captured.stdout()).toBe(
      "  WARN  widget-9: state unknown, last used 2026-01-02, stale: branch '9' is gone\n",
    );
    expect(fake.captured.stderr()).toContain('could not read the process list');
  });

  it('reports unknown under --json, with no PID, port, or endpoint, when the process list is unreadable', async () => {
    const fake = makeFakeThorChrome({ results: { pgrep: { status: 3 } } });
    makeFrozenProfile(fake, 'thrive', { origin: 'named' });
    await expect(run(fake, ['list', '--json'])).resolves.toBe(0);
    expect(fake.readReport()['profiles']).toMatchObject([
      { name: 'thrive', state: 'unknown', pid: null, port: null, devtools: null },
    ]);
    expect(fake.captured.stderr()).toBe('');
  });

  it('prints the rich glyphs, coloured, on a terminal', async () => {
    const fake = makeFakeThorChrome({ env: { TERM: 'xterm' }, results: { pgrep: { status: 3 } } });
    fake.deps.isStdoutTerminal = true;
    makeFrozenProfile(fake, 'thrive', { origin: 'named' });
    await run(fake, ['list']);
    expect(fake.captured.stdout()).toBe('  \u{1B}[33m🟠\u{1B}[0m thrive: state unknown, last used 2026-01-02\n');
  });
});

// region | Helpers

/** Returns the record that a launch derived from the working repository and a branch would have left. */
function derivedRecord(fake: FakeThorChrome, branch: string): Record<string, string> {
  return { origin: 'derived', branch, repo: 'widget', repo_dir: fake.workRepoDir };
}

/** Creates a profile whose mtime is the fixed last use against which the reports are written. */
function makeFrozenProfile(fake: FakeThorChrome, name: string, record?: Record<string, string>): void {
  const dir = fake.makeProfile(name, record);
  fs.utimesSync(dir, LAST_USED, LAST_USED);
}

/**
 * Builds a fake whose working repository exists and has only the given branches, so that a profile derived from any
 * other branch of it is stale.
 */
function makeFakeWithBranches(
  branches: readonly string[],
  results: Record<string, { status?: number }> = {},
): FakeThorChrome {
  const fake = makeFakeThorChrome({ results });
  fs.mkdirSync(fake.workRepoDir, { recursive: true });
  const { run } = fake.deps;
  fake.deps.run = (program, args, options) => {
    if (program !== 'git' || args[1] !== fake.workRepoDir) return run(program, args, options);
    const isFound = args[2] === 'rev-parse' || branches.some((branch) => args.at(-1) === `refs/heads/${branch}`);
    return { status: isFound ? 0 : 1, stderr: '', stdout: '' };
  };
  return fake;
}

/** Replaces the PROFILES placeholder in the fake's answer keys with the profiles directory, escaped as pgrep receives it. */
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

/** Runs thor-chrome against the fake. */
function run(fake: FakeThorChrome, args: string[]): Promise<number> {
  return runThorChrome(args, fake.captured.output, fake.deps);
}

// endregion | Helpers
