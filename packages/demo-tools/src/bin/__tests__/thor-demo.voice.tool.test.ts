import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildVoiceConfig,
  createFakeVoiceTools,
  FAKE_SPEECH_DELAY_MS,
  FAKE_SPEECH_STATUS,
  type FakeVoiceMachine,
} from '../test-utils/create-fake-voice-tools.ts';
import { runThorDemo } from '../test-utils/run-thor-demo.ts';

const ENTRY_POINT = path.join(import.meta.dirname, '../thor-demo.ts');

const DEFAULT_MODEL = 'mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16';

describe('thor-demo voice setup', () => {
  it('installs, downloads, builds the profile, and verifies through a loopback-only, offline server', () => {
    using machine = createFakeVoiceTools();
    const home = machine.voiceHome;

    const { status, stderr, stdout } = runVoiceSetup(machine);

    expect(status).toBe(0);
    expect(stdout).toBe(`${home}/verify.mp3\n`);
    expect(readFileSync(`${home}/verify.mp3`, 'utf8')).toBe('ID3fake');
    expect(stderr).toContain('thor-demo voice setup: installing mlx-audio 0.6.3');
    expect(machine.readCalls().map(({ args, tool }) => [tool, args[0]])).toStrictEqual([
      ['uv', 'venv'],
      ['uv', 'pip'],
      ['hf', 'download'],
      ['ffmpeg', '-nostdin'],
      ['python', '-m'],
    ]);

    const server = machine.readCalls().at(-1);
    expect(server?.args).toStrictEqual(expect.arrayContaining(['--host', '127.0.0.1']));
    expect(server?.env).toStrictEqual({ HF_HOME: `${home}/hf`, HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' });
    expect(machine.readSpeechRequests()).toStrictEqual([
      {
        body: {
          input: 'This is a test of the cloned voice.',
          model: `${home}/models/mlx-community--Qwen3-TTS-12Hz-1.7B-Base-bf16`,
          ref_audio: `${home}/profile/reference.wav`,
          ref_text: 'Hello there.',
          response_format: 'mp3',
        },
        host: '127.0.0.1',
      },
    ]);
    expect(isServerRunning(machine)).toBe(false);
  });

  it('skips the install, the download, and the profile on a rerun with unchanged inputs, and still verifies', () => {
    using machine = createFakeVoiceTools();
    runVoiceSetup(machine);
    const firstCalls = machine.readCalls().length;

    const { status, stderr } = runVoiceSetup(machine);

    expect(status).toBe(0);
    expect(
      machine
        .readCalls()
        .slice(firstCalls)
        .map(({ tool }) => tool),
    ).toStrictEqual(['python']);
    expect(stderr).toContain('mlx-audio 0.6.3 is installed; skipping');
    expect(stderr).toContain(`${DEFAULT_MODEL} is downloaded; skipping`);
    expect(stderr).toContain('the voice profile is current; skipping');
  });

  it('rebuilds only the profile when the reference recording changes', () => {
    using machine = createFakeVoiceTools();
    runVoiceSetup(machine);
    const firstCalls = machine.readCalls().length;
    writeFileSync(machine.tree.resolve('home/reference.m4a'), 'new audio');

    runVoiceSetup(machine);

    expect(
      machine
        .readCalls()
        .slice(firstCalls)
        .map(({ tool }) => tool),
    ).toStrictEqual(['ffmpeg', 'python']);
  });

  it('downloads the new model and rebuilds the profile when the model changes', () => {
    using machine = createFakeVoiceTools();
    runVoiceSetup(machine);
    const firstCalls = machine.readCalls().length;
    writeFileSync(machine.tree.resolve('home/.config/thor-demo/config.yaml'), buildVoiceConfig('org/other'));

    runVoiceSetup(machine);

    const calls = machine.readCalls().slice(firstCalls);
    expect(calls.map(({ tool }) => tool)).toStrictEqual(['hf', 'ffmpeg', 'python']);
    expect(calls[0]?.args.slice(0, 2)).toStrictEqual(['download', 'org/other']);
    expect(machine.readSpeechRequests().at(-1)?.body['model']).toBe(`${machine.voiceHome}/models/org--other`);
  });

  it('exits 1 and stops the server when verification fails', () => {
    using machine = createFakeVoiceTools();

    const { status, stderr, stdout } = runVoiceSetup(machine, { [FAKE_SPEECH_STATUS]: '500' });

    expect(status).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toContain('thor-demo voice setup: the voice-clone server answered 500');
    expect(existsSync(`${machine.voiceHome}/verify.mp3`)).toBe(false);
    expect(isServerRunning(machine)).toBe(false);
  });

  it('stops the server when thor-demo receives SIGTERM during verification', async () => {
    using machine = createFakeVoiceTools();
    const child = spawn(process.execPath, [ENTRY_POINT, 'voice', 'setup'], {
      cwd: machine.tree.dir,
      env: { ...process.env, ...machine.env, [FAKE_SPEECH_DELAY_MS]: '60000' },
      stdio: 'ignore',
    });
    const exited = new Promise<number | null>((resolve) => child.once('exit', (code) => resolve(code)));

    await waitFor(() => machine.readSpeechRequests().length > 0);
    child.kill('SIGTERM');

    await expect(exited).resolves.toBe(143);
    expect(isServerRunning(machine)).toBe(false);
  });
});

// region | Helpers

/** Reports whether the fake speech server's process exists. */
function isServerRunning(machine: FakeVoiceMachine): boolean {
  const pid = machine.readServerPid();
  if (pid === undefined) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Runs `thor-demo voice setup` on the fake machine, with `extraEnv` added. */
function runVoiceSetup(machine: FakeVoiceMachine, extraEnv: NodeJS.ProcessEnv = {}) {
  return runThorDemo(['voice', 'setup'], machine.tree.dir, { ...machine.env, ...extraEnv });
}

/** Resolves once `condition` holds, polling every 50 ms, or rejects after 10 seconds. */
async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for the condition');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

// endregion | Helpers
