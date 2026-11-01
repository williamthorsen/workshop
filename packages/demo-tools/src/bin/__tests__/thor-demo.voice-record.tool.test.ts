import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createFakeVoiceTools,
  FAKE_PEAK_DB,
  FAKE_PLAYBACK_HOLD,
  type FakeVoiceMachine,
} from '../test-utils/create-fake-voice-tools.ts';
import { runThorDemo } from '../test-utils/run-thor-demo.ts';
import { waitFor } from '../test-utils/wait-for.ts';

const ENTRY_POINT = path.join(import.meta.dirname, '../thor-demo.ts');

describe('thor-demo voice record', () => {
  it('shows the transcript, records the named microphone to the reference, and plays it back', () => {
    using machine = createFakeVoiceTools();
    const reference = machine.tree.resolve('home/reference.m4a');

    const { status, stderr, stdout } = runVoice(machine, ['record', '--microphone', 'Desk Mic']);

    expect(status).toBe(0);
    expect(stdout).toBe(`${reference}\n`);
    expect(stderr).toContain('\nHello there.\n');
    expect(stderr).toContain(`recorded 12.5 seconds to ${reference}; peak -6 dB, mean -24 dB`);
    expect(readFileSync(reference, 'utf8')).toBe('RIFFtake');
    expect(readFileSync(machine.tree.resolve('home/reference.previous.m4a'), 'utf8')).toBe('audio');
    expect(readdirSync(machine.tree.resolve('home')).filter((name) => name.startsWith('.recording-'))).toStrictEqual(
      [],
    );

    const calls = machine.readCalls();
    expect(calls.map(({ tool }) => tool)).toStrictEqual(['swiftc', 'recorder', 'ffmpeg', 'ffmpeg', 'afplay']);
    expect(calls[1]?.args).toStrictEqual(['record', 'Desk Mic', expect.stringMatching(/capture\.wav$/), '60']);
    expect(calls.at(-1)?.args).toStrictEqual([reference]);
  });

  it('compiles the recorder once', () => {
    using machine = createFakeVoiceTools();
    runVoice(machine, ['record']);
    const firstCalls = machine.readCalls().length;

    runVoice(machine, ['record']);

    expect(
      machine
        .readCalls()
        .slice(firstCalls)
        .map(({ tool }) => tool),
    ).not.toContain('swiftc');
  });

  it('warns about a quiet take', () => {
    using machine = createFakeVoiceTools();

    const { stderr } = runVoice(machine, ['record'], { [FAKE_PEAK_DB]: '-30.0' });

    expect(stderr).toContain('warning: the take is quiet; record closer to the microphone');
  });

  it('records before any reference exists, without keeping a previous take', () => {
    using machine = createFakeVoiceTools({ withoutReference: true });

    const { status } = runVoice(machine, ['record']);

    expect(status).toBe(0);
    expect(existsSync(machine.tree.resolve('home/reference.previous.m4a'))).toBe(false);
  });

  it("finishes with the take's path when Ctrl-C stops the playback", async () => {
    using machine = createFakeVoiceTools();
    // Lead a process group of its own, as a terminal's foreground job does, so that the signal reaches the player too.
    const child = spawn(process.execPath, [ENTRY_POINT, 'voice', 'record'], {
      cwd: machine.tree.dir,
      detached: true,
      env: { ...process.env, ...machine.env, [FAKE_PLAYBACK_HOLD]: '1' },
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    const closed = new Promise<number | null>((resolve) => child.once('close', (code) => resolve(code)));

    await waitFor(() => machine.readCalls().some(({ tool }) => tool === 'afplay'));
    assert.ok(child.pid !== undefined, 'thor-demo did not start');
    process.kill(-child.pid, 'SIGINT');

    await expect(closed).resolves.toBe(0);
    expect(stdout).toBe(`${machine.tree.resolve('home/reference.m4a')}\n`);
  });
});

describe('thor-demo voice microphones', () => {
  it("prints the recorder's list of microphones", () => {
    using machine = createFakeVoiceTools();

    const { status, stdout } = runVoice(machine, ['microphones']);

    expect(status).toBe(0);
    expect(stdout).toBe('Desk Mic\nLaptop Mic\n');
  });
});

// region | Helpers

/** Runs `thor-demo voice <args>` on the fake machine, with `extraEnv` added. */
function runVoice(machine: FakeVoiceMachine, args: string[], extraEnv: NodeJS.ProcessEnv = {}) {
  return runThorDemo(['voice', ...args], machine.tree.dir, { ...machine.env, ...extraEnv });
}

// endregion | Helpers
