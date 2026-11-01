import { describe, expect, it } from 'vitest';

import { MLX_AUDIO_VERSION, planInstall, planModelDownload, PYTHON_VERSION } from '../plan-install.ts';

describe(planInstall, () => {
  it('recreates the virtual environment with the pinned Python, then installs the pinned mlx-audio server', () => {
    expect(planInstall('/voice')).toStrictEqual([
      { command: 'uv', args: ['venv', '--clear', '--python', PYTHON_VERSION, '/voice/venv'], env: {} },
      {
        command: 'uv',
        args: ['pip', 'install', '--python', '/voice/venv/bin/python', `mlx-audio[server]==${MLX_AUDIO_VERSION}`],
        env: {},
      },
    ]);
  });
});

describe(planModelDownload, () => {
  it("downloads the model into its directory with the virtual environment's hf, caching under the install", () => {
    expect(planModelDownload('/voice', 'org/model')).toStrictEqual([
      {
        command: '/voice/venv/bin/hf',
        args: ['download', 'org/model', '--local-dir', '/voice/models/org--model'],
        env: { HF_HOME: '/voice/hf' },
      },
    ]);
  });

  it('then caches the codec that Higgs Audio v2 loads from a repository of its own', () => {
    expect(planModelDownload('/voice', 'mlx-community/higgs-audio-v2-3B-mlx-q8').slice(1)).toStrictEqual([
      {
        command: '/voice/venv/bin/hf',
        args: ['download', 'mlx-community/higgs-audio-v2-tokenizer'],
        env: { HF_HOME: '/voice/hf' },
      },
    ]);
  });
});
