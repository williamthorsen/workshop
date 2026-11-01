import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { DEFAULT_VOICE_HOME, DEFAULT_VOICE_MODEL, type VoiceConfig } from '../../config/read-machine-config.ts';
import { readProfileSources } from '../../voice/build-voice-profile.ts';
import { formatModelDir } from '../../voice/mlx-audio/format-model-dir.ts';
import { run, type RunEffects, type RunResult } from '../run.ts';
import { createDemoRepo, type DemoRepo } from '../test-utils/create-demo-repo.ts';

const VOICE_SECTION = 'voice:\n  reference:\n    audio: ~/reference.m4a\n    transcript: ~/reference.txt\n';

describe('run revoice', () => {
  it('requests the three aidemo stages against the cloned voice, with the take described as cloned', async () => {
    using home = createVoiceHome();
    using repo = createDemoRepo({ aidemoVersion: '0.20.2', recorded: true });
    const source = { commit: 'abc1234def', dirty: false };
    const archiveRoot = home.resolve('archive');

    const result = await run(['revoice', 'quickstart'], {
      ...buildEffects(home, repo),
      env: {
        OPENAI_API_KEY: 'sk-real',
        OPENAI_BASE_URL: 'https://api.openai.com/v1',
        PATH: '/bin',
        THOR_DEMO_ARCHIVE_ROOT: archiveRoot,
      },
      readSourceState: () => source,
    });

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(result.launch).toBeUndefined();
    const demoDir = repo.tree.resolve('demos/quickstart');
    expect(result.revoice).toMatchObject({
      bin: repo.tree.resolve('node_modules/@tandryukha/aidemo/bin/aidemo.mjs'),
      cwd: repo.tree.dir,
      stages: [
        ['voice', demoDir, '--force'],
        ['captions', demoDir, '--offline'],
        ['compose', demoDir],
      ],
      voice: readVoiceConfig(home),
      take: {
        kind: 'archive',
        plan: {
          aidemoVersion: '0.20.2',
          archiveRoot,
          demo: 'quickstart',
          params: [],
          reference: { sha256: readProfileSources(readVoiceConfig(home)).referenceSha256 },
          source,
          voice: { provider: 'mlx-audio', voiceId: DEFAULT_VOICE_MODEL },
        },
      },
    });
    expect(result.revoice?.env).toStrictEqual({
      AIDEMO_TTS_MODEL: DEFAULT_VOICE_MODEL,
      AIDEMO_TTS_PROVIDER: 'openai',
      PATH: '/bin',
      THOR_DEMO_ARCHIVE_ROOT: archiveRoot,
    });
  });

  it('accepts a demo recorded through native capture', async () => {
    using home = createVoiceHome();
    using repo = createDemoRepo({ aidemoVersion: '0.20.2' });
    repo.tree.write('demos/quickstart/recordings/raw.mp4', 'video');
    repo.tree.write('demos/quickstart/generated/timeline.json', '{}');

    const result = await run(['revoice', 'quickstart'], buildEffects(home, repo));

    expect(result.exitCode).toBe(0);
    expect(result.revoice).toBeDefined();
  });

  it('lists the demos for an unknown one, as a usage error', async () => {
    using home = createVoiceHome();
    using repo = createDemoRepo({ aidemoVersion: '0.20.2', recorded: true });

    const result = await run(['revoice', 'quick'], buildEffects(home, repo));

    expect(result.exitCode).toBe(2);
    expect(result.revoice).toBeUndefined();
    expect(result.stderr).toContain('unknown demo "quick"; the demos in demos are: quickstart');
  });

  it('stops on a machine that is not Apple Silicon', async () => {
    using home = createVoiceHome();
    using repo = createDemoRepo({ aidemoVersion: '0.20.2', recorded: true });

    const result = await run(['revoice', 'quickstart'], { ...buildEffects(home, repo), arch: 'x64' });

    expect(summarizeRefusal(result)).toStrictEqual(refusal('the voice clone runs on Apple Silicon'));
  });

  it('stops when voice setup has not run, naming it', async () => {
    using home = createVoiceHome({ installed: false });
    using repo = createDemoRepo({ aidemoVersion: '0.20.2', recorded: true });

    const result = await run(['revoice', 'quickstart'], buildEffects(home, repo));

    expect(summarizeRefusal(result)).toStrictEqual(refusal('; run thor-demo voice setup'));
  });

  it('stops when the profile was built from another reference recording', async () => {
    using home = createVoiceHome();
    using repo = createDemoRepo({ aidemoVersion: '0.20.2', recorded: true });
    writeFileSync(home.resolve('home/reference.m4a'), 'another take');

    const result = await run(['revoice', 'quickstart'], buildEffects(home, repo));

    expect(summarizeRefusal(result)).toStrictEqual(
      refusal('the voice profile was built from another recording than voice.reference.audio'),
    );
  });

  it('stops on an aidemo older than 0.20.2, naming the version required', async () => {
    using home = createVoiceHome();
    using repo = createDemoRepo({ aidemoVersion: '0.20.1', recorded: true });

    const result = await run(['revoice', 'quickstart'], buildEffects(home, repo));

    expect(summarizeRefusal(result)).toStrictEqual(refusal('0.20.1 is installed'));
  });

  it('stops when the .env sets a variable that would send the narration elsewhere', async () => {
    using home = createVoiceHome();
    using repo = createDemoRepo({
      aidemoVersion: '0.20.2',
      envFile: 'OPENAI_API_KEY=sk-x\nAIDEMO_TTS_PROVIDER=elevenlabs\n',
      recorded: true,
    });

    const result = await run(['revoice', 'quickstart'], buildEffects(home, repo));

    expect(summarizeRefusal(result)).toStrictEqual(
      refusal(`${repo.tree.resolve('.env')} sets AIDEMO_TTS_PROVIDER, which aidemo loads over`),
    );
  });

  it('stops on a demo that has not been recorded, saying to render it first', async () => {
    using home = createVoiceHome();
    using repo = createDemoRepo({ aidemoVersion: '0.20.2' });

    const result = await run(['revoice', 'quickstart'], buildEffects(home, repo));

    expect(summarizeRefusal(result)).toStrictEqual(
      refusal('quickstart has not been recorded; render it first with thor-demo render quickstart'),
    );
  });

  it('lists revoice in the root help and documents its prerequisites', async () => {
    using home = createVoiceHome();
    using repo = createDemoRepo();

    const root = await run(['--help'], buildEffects(home, repo));
    const own = await run(['revoice', '--help'], buildEffects(home, repo));

    expect(root.stdout).toMatch(/revoice +Narrate a recorded demo again/);
    expect(own.exitCode).toBe(0);
    expect(own.stdout).toContain('@tandryukha/aidemo 0.20.2 or later');
    expect(own.stdout).toContain('ignores voice.speed and voice.instructions');
  });
});

// region | Helpers

/** Returns effects for a run from the repository's root, on Apple Silicon, with the home in `home`. */
function buildEffects(home: TempTree, repo: DemoRepo): RunEffects {
  return {
    arch: 'arm64',
    cwd: repo.tree.dir,
    env: { THOR_DEMO_ARCHIVE_ROOT: home.resolve('archive') },
    homeDir: home.resolve('home'),
    platform: 'darwin',
    readSourceState: () => undefined,
    resolveVersion: () => '9.9.9',
  };
}

/**
 * Builds a home with a voice section and a reference recording and transcript and, unless `installed` is false, a
 * voice clone installed from them.
 */
function createVoiceHome({ installed = true }: { installed?: boolean } = {}): TempTree {
  const tree = createTempTree({
    'home/.config/thor-demo/config.yaml': VOICE_SECTION,
    'home/reference.m4a': 'audio',
    'home/reference.txt': 'Hello.',
  });
  if (!installed) return tree;

  const voice = readVoiceConfig(tree);
  tree.write(`home/${DEFAULT_VOICE_HOME}/venv/bin/python`, '');
  tree.write(path.join(path.relative(tree.dir, formatModelDir(voice.home, voice.model)), 'config.json'), '{}');
  tree.write(
    `home/${DEFAULT_VOICE_HOME}/profile/profile.json`,
    JSON.stringify({ schemaVersion: 1, model: voice.model, ...readProfileSources(voice) }),
  );
  return tree;
}

/** Returns the voice configuration to which the home's voice section resolves. */
function readVoiceConfig(tree: TempTree): VoiceConfig {
  return {
    home: tree.resolve(`home/${DEFAULT_VOICE_HOME}`),
    model: DEFAULT_VOICE_MODEL,
    referenceAudio: tree.resolve('home/reference.m4a'),
    referenceTranscript: tree.resolve('home/reference.txt'),
  };
}

/** Returns the summary of a refusal, with exit 1 and nothing requested, whose message under the prefix contains `problem`. */
function refusal(problem: string) {
  return { exitCode: 1, requested: false, stderr: expect.stringContaining(problem), prefixed: true };
}

/** Summarizes what a refused revoice must show: its exit code, whether it requested anything, and its message. */
function summarizeRefusal(result: RunResult) {
  return {
    exitCode: result.exitCode,
    requested: result.revoice !== undefined,
    stderr: result.stderr,
    prefixed: result.stderr.startsWith('thor-demo revoice: '),
  };
}

// endregion | Helpers
