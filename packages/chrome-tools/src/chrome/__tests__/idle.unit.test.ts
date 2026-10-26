import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { makeStubPath } from '../../test-utils/stub-path.ts';
import { IDLE_RECORD_FILE } from '../idle.ts';
import { type FakeThorChrome, makeFakeThorChrome, makeRunningFakeThorChrome } from '../test-utils/fake-thor-chrome.ts';
import { runThorChrome } from '../thor-chrome.ts';

const HOUR_MILLISECONDS = 3_600_000;
const CONNECTED = { status: 0, stdout: 'chrome 4242 u 30u IPv4 TCP 127.0.0.1:9000->127.0.0.1:50000 (ESTABLISHED)\n' };

describe('quit --idle', () => {
  it('records a browser without a client on the first run and quits it once the duration has passed', async () => {
    const fake = makeRunningFakeThorChrome(['thrive'], { hasPorts: true });
    await expect(run(fake, ['quit', '--idle', '2h'])).resolves.toBe(0);
    expect(fake.killed).toStrictEqual([]);

    fake.advance(HOUR_MILLISECONDS);
    await run(fake, ['quit', '--idle', '2h']);
    expect(fake.killed).toStrictEqual([]);

    fake.advance(HOUR_MILLISECONDS);
    await run(fake, ['quit', '--idle', '2h']);
    expect(fake.killed).toStrictEqual([4_242]);
    expect(fake.captured.stdout()).toBe(
      "No idle profiles.\nNo idle profiles.\nQuit idle profile 'thrive' (PID 4242).\n",
    );
  });

  it('keeps every profile directory, a named profile included, and drops a quit browser from the record', async () => {
    const fake = makeRunningFakeThorChrome(['thrive'], { hasPorts: true });
    fake.makeProfile('hq', { origin: 'named' });
    await run(fake, ['quit', '--idle', '1s']);
    fake.advance(1_000);
    await run(fake, ['quit', '--idle', '1s']);
    expect(fake.killed).toStrictEqual([4_242]);
    expect(fs.readdirSync(fake.profilesDir).filter((name) => !name.startsWith('.'))).toStrictEqual(['hq', 'thrive']);
    expect(readRecord(fake)).toStrictEqual({});
  });

  it('leaves alone a browser that has a client connected, and restarts its idle clock', async () => {
    const fake = makeRunningFakeThorChrome(['thrive'], { hasPorts: true });
    await run(fake, ['quit', '--idle', '2h']);
    fake.advance(HOUR_MILLISECONDS);
    fake.lsof.set(4_242, CONNECTED);
    await run(fake, ['quit', '--idle', '2h']);
    expect(readRecord(fake)).toStrictEqual({});

    fake.lsof.delete(4_242);
    fake.advance(HOUR_MILLISECONDS);
    await run(fake, ['quit', '--idle', '2h']);
    fake.advance(HOUR_MILLISECONDS);
    await run(fake, ['quit', '--idle', '2h']);
    expect(fake.killed).toStrictEqual([]);
  });

  it.each([
    ['an lsof that reports an error', { status: 1, stderr: 'lsof: WARNING: can not stat\n' }],
    ['an lsof that fails otherwise', { status: 2 }],
    ['an lsof that succeeds without output', { status: 0 }],
  ])('treats %s as a connected client', async (_case, answer) => {
    const fake = makeRunningFakeThorChrome(['thrive'], { hasPorts: true });
    fake.lsof.set(4_242, answer);
    await run(fake, ['quit', '--idle', '1s']);
    fake.advance(HOUR_MILLISECONDS);
    await run(fake, ['quit', '--idle', '1s']);
    expect(fake.killed).toStrictEqual([]);
    expect(readRecord(fake)).toStrictEqual({});
  });

  it('leaves alone a browser without a debugging port, whose clients cannot be read', async () => {
    const fake = makeRunningFakeThorChrome(['thrive']);
    await run(fake, ['quit', '--idle', '1s']);
    fake.advance(HOUR_MILLISECONDS);
    await run(fake, ['quit', '--idle', '1s']);
    expect(fake.killed).toStrictEqual([]);
  });

  it('restarts the idle clock of a browser relaunched under another PID', async () => {
    const fake = makeRunningFakeThorChrome(['thrive'], { hasPorts: true });
    await run(fake, ['quit', '--idle', '2h']);
    fake.advance(HOUR_MILLISECONDS);
    const pid = fake.relaunch('thrive');
    await run(fake, ['quit', '--idle', '2h']);
    expect(readRecord(fake)).toStrictEqual({ thrive: { idleSince: expect.any(Number), pid: String(pid) } });

    fake.advance(HOUR_MILLISECONDS);
    await run(fake, ['quit', '--idle', '2h']);
    expect(fake.killed).toStrictEqual([]);
  });

  it('reads an unreadable record as empty, which only delays the quit', async () => {
    const fake = makeRunningFakeThorChrome(['thrive'], { hasPorts: true });
    fs.writeFileSync(`${fake.profilesDir}/${IDLE_RECORD_FILE}`, '{not json');
    await run(fake, ['quit', '--idle', '1s']);
    expect(fake.killed).toStrictEqual([]);
    expect(readRecord(fake)).toStrictEqual({ thrive: { idleSince: expect.any(Number), pid: '4242' } });
  });

  it('drops the entry of a browser that stopped between runs', async () => {
    const fake = makeRunningFakeThorChrome(['thrive', 'atlas'], { hasPorts: true });
    await run(fake, ['quit', '--idle', '2h']);
    await run(fake, ['quit', 'atlas']);
    await run(fake, ['quit', '--idle', '2h']);
    expect(Object.keys(readRecord(fake))).toStrictEqual(['thrive']);
  });

  it('reports only what it quit under --json', async () => {
    const fake = makeRunningFakeThorChrome(['thrive'], { hasPorts: true });
    await expect(run(fake, ['quit', '--idle', '1s', '--json'])).resolves.toBe(0);
    fake.advance(1_000);
    await expect(run(fake, ['quit', '--idle', '1s', '--json'])).resolves.toBe(0);
    const [first, second] = fake.captured.stdout().trimEnd().split('\n', 2);
    expect(first).toBe('{"profiles":[]}');
    expect(JSON.parse(second ?? '')).toMatchObject({ profiles: [{ name: 'thrive', pid: 4_242, state: 'stopped' }] });
  });

  it('exits 1 when an idle browser cannot be quit, keeping it in the record', async () => {
    const fake = makeRunningFakeThorChrome(['thrive'], { hasPorts: true, isKillRefused: true });
    await run(fake, ['quit', '--idle', '1s']);
    fake.advance(1_000);
    await expect(run(fake, ['quit', '--idle', '1s'])).resolves.toBe(1);
    expect(fake.captured.stderr()).toBe("thor-chrome: could not signal PID 4242 for profile 'thrive'\n");
    expect(Object.keys(readRecord(fake))).toStrictEqual(['thrive']);
  });

  it('refuses with process-list-unavailable before writing the record', async () => {
    const fake = makeFakeThorChrome({ results: { pgrep: { status: 3 } } });
    fake.makeProfile('thrive');
    await expect(run(fake, ['quit', '--idle', '2h'])).resolves.toBe(1);
    expect(fs.existsSync(`${fake.profilesDir}/${IDLE_RECORD_FILE}`)).toBe(false);
  });

  it('refuses with missing-command when lsof is not on PATH, quitting nothing', async () => {
    const fake = makeRunningFakeThorChrome(['thrive'], { hasPorts: true });
    fake.env['PATH'] = makeStubPath({ curl: 'exit 0', pgrep: 'exit 0' }, '');
    await expect(run(fake, ['quit', '--idle', '1s'])).resolves.toBe(127);
    expect(fake.killed).toStrictEqual([]);
  });
});

// region | Helpers

/** Returns the idle record as the run left it. */
function readRecord(fake: FakeThorChrome): Record<string, unknown> {
  const record: unknown = JSON.parse(fs.readFileSync(`${fake.profilesDir}/${IDLE_RECORD_FILE}`, 'utf8'));
  if (typeof record !== 'object' || record === null) throw new Error('the idle record is not an object');
  return { ...record };
}

/** Runs thor-chrome against the fake. */
function run(fake: FakeThorChrome, args: string[]): Promise<number> {
  return runThorChrome(args, fake.captured.output, fake.deps);
}

// endregion | Helpers
