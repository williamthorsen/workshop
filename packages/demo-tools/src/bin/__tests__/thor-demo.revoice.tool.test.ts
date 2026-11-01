import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { isRecord } from '../../portable/is-record.ts';
import { createDemoRepo, type DemoRepo } from '../test-utils/create-demo-repo.ts';
import { createFakeVoiceTools, type FakeVoiceMachine } from '../test-utils/create-fake-voice-tools.ts';
import { runThorDemo } from '../test-utils/run-thor-demo.ts';
import { waitFor } from '../test-utils/wait-for.ts';

const ENTRY_POINT = path.join(import.meta.dirname, '../thor-demo.ts');

const MODEL = 'mlx-community/higgs-audio-v2-3B-mlx-q8';

const OUTPUT_FILES = { 'final-demo.mp4': 'video bytes', 'final-demo.srt': 'srt', 'final-demo.vtt': 'vtt' };

describe('thor-demo revoice', () => {
  it('re-voices through the proxy, captions offline, composes, and archives the take as cloned', () => {
    using machine = createInstalledMachine();
    using repo = createDemoRepo({ aidemoVersion: '0.20.2', outputFiles: OUTPUT_FILES, recorded: true });
    using archive = createTempTree({ '.keep': '' });

    const { status, stderr } = runThorDemo(['revoice', 'quickstart'], repo.tree.dir, {
      ...machine.env,
      THOR_DEMO_ARCHIVE_ROOT: archive.dir,
    });

    expect(stderr).toContain('thor-demo revoice: archived take to');
    expect(status).toBe(0);
    const demoDir = repo.tree.resolve('demos/quickstart');
    const calls = repo.readCalls();
    expect(calls.map(({ args }) => args)).toStrictEqual([
      ['voice', demoDir, '--force'],
      ['captions', demoDir, '--offline'],
      ['compose', demoDir],
    ]);
    expect(calls[0]?.speechStatus).toBe(200);
    expect(calls[0]?.env).toMatchObject({ AIDEMO_TTS_MODEL: MODEL, AIDEMO_TTS_PROVIDER: 'openai' });
    expect(calls[0]?.env['AIDEMO_OPENAI_BASE_URL']).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/v1$/);

    const home = machine.voiceHome;
    expect(machine.readSpeechRequests().filter(({ body }) => body['input'] === 'Scene one.')).toStrictEqual([
      {
        body: {
          input: 'Scene one.',
          model: `${home}/models/mlx-community--higgs-audio-v2-3B-mlx-q8`,
          ref_audio: `${home}/profile/reference.wav`,
          ref_text: 'Hello there.',
          response_format: 'mp3',
        },
        host: '127.0.0.1',
      },
    ]);
    const server = machine.readCalls().at(-1);
    expect(server?.args).toStrictEqual(expect.arrayContaining(['--host', '127.0.0.1']));
    expect(server?.env).toMatchObject({ HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' });
    expect(isServerRunning(machine)).toBe(false);

    const provenance = readProvenance(archive.dir);
    expect(provenance).toMatchObject({
      demo: 'quickstart',
      engine: { version: '0.20.2' },
      params: [],
      reference: { sha256: sha256(readFileSync(machine.tree.resolve('home/reference.m4a'))) },
      voice: { provider: 'mlx-audio', voiceId: MODEL },
    });
  });

  it('stops the server and archives nothing when an aidemo stage fails', () => {
    using machine = createInstalledMachine();
    using repo = createDemoRepo({ aidemoVersion: '0.20.2', exitCode: 4, failOn: 'captions', recorded: true });
    using archive = createTempTree({ '.keep': '' });

    const { status, stderr } = runRevoice(machine, repo, archive.dir);

    expect(status).toBe(4);
    expect(stderr).toContain('thor-demo revoice: aidemo captions exited with code 4');
    expect(repo.readCalls().map(({ args }) => args[0])).toStrictEqual(['voice', 'captions']);
    expect(readdirSync(archive.dir)).toStrictEqual(['.keep']);
    expect(isServerRunning(machine)).toBe(false);
  });

  it('stops before starting the server on a demo that has not been recorded', () => {
    using machine = createInstalledMachine();
    using repo = createDemoRepo({ aidemoVersion: '0.20.2' });
    const serversBefore = machine.readCalls().filter(({ tool }) => tool === 'python').length;

    const { status, stderr } = runRevoice(machine, repo, repo.tree.dir);

    expect(status).toBe(1);
    expect(stderr).toBe(
      'thor-demo revoice: quickstart has not been recorded; render it first with thor-demo render quickstart\n',
    );
    expect(machine.readCalls().filter(({ tool }) => tool === 'python')).toHaveLength(serversBefore);
    expect(repo.readCalls()).toStrictEqual([]);
  });

  it('stops the server when thor-demo receives SIGTERM during a stage', async () => {
    using machine = createInstalledMachine();
    using repo = createDemoRepo({ aidemoVersion: '0.20.2', holdOn: 'captions', recorded: true });
    const child = spawn(process.execPath, [ENTRY_POINT, 'revoice', 'quickstart'], {
      cwd: repo.tree.dir,
      env: { ...process.env, ...machine.env },
      stdio: 'ignore',
    });
    const exited = new Promise<number | null>((resolve) => child.once('exit', (code) => resolve(code)));

    await waitFor(() => repo.readCalls().some(({ args }) => args[0] === 'captions'));
    child.kill('SIGTERM');

    await expect(exited).resolves.toBe(143);
    expect(isServerRunning(machine)).toBe(false);
  });
});

// region | Helpers

/** Creates a fake voice machine on which `thor-demo voice setup` has run. */
function createInstalledMachine(): FakeVoiceMachine {
  const machine = createFakeVoiceTools();
  const setup = runThorDemo(['voice', 'setup'], machine.tree.dir, machine.env);
  if (setup.status !== 0) throw new Error(`voice setup failed: ${setup.stderr}`);
  return machine;
}

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

/** Reads the provenance record of the one take archived under `archiveRoot`. */
function readProvenance(archiveRoot: string): Record<string, unknown> {
  const record = readdirSync(archiveRoot, { recursive: true, encoding: 'utf8' }).find((entry) =>
    entry.endsWith('provenance.json'),
  );
  if (record === undefined) throw new Error(`no provenance.json under ${archiveRoot}`);
  const parsed: unknown = JSON.parse(readFileSync(path.join(archiveRoot, record), 'utf8'));
  if (!isRecord(parsed)) throw new Error('provenance.json is not an object');
  return parsed;
}

/** Runs `thor-demo revoice quickstart` in the repository, on the fake machine, archiving to `archiveRoot`. */
function runRevoice(machine: FakeVoiceMachine, repo: DemoRepo, archiveRoot: string) {
  return runThorDemo(['revoice', 'quickstart'], repo.tree.dir, { ...machine.env, THOR_DEMO_ARCHIVE_ROOT: archiveRoot });
}

/** Returns the sha256 of `content`. */
function sha256(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}

// endregion | Helpers
