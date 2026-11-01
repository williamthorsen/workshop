import path from 'node:path';

import type { Invocation } from '../invocation.ts';
import { formatModelDir } from './format-model-dir.ts';

/** The mlx-audio release whose server contract the request builder targets. */
export const MLX_AUDIO_VERSION = '0.6.3';

/** The Python version of the virtual environment, the one tested with `MLX_AUDIO_VERSION`. */
export const PYTHON_VERSION = '3.12';

/** Returns the environment variables that keep Hugging Face's caches under `home`. */
export function buildHuggingFaceEnv(home: string): Record<string, string> {
  return { HF_HOME: path.join(home, 'hf') };
}

/** Returns the interpreter of the virtual environment under `home`. */
export function formatVenvPython(home: string): string {
  return path.join(home, 'venv', 'bin', 'python');
}

/** Returns the commands that recreate the virtual environment under `home` and install the pinned mlx-audio into it. */
export function planInstall(home: string): readonly Invocation[] {
  return [
    { command: 'uv', args: ['venv', '--clear', '--python', PYTHON_VERSION, path.join(home, 'venv')], env: {} },
    {
      command: 'uv',
      args: ['pip', 'install', '--python', formatVenvPython(home), `mlx-audio[server]==${MLX_AUDIO_VERSION}`],
      env: {},
    },
  ];
}

/**
 * Returns the commands that download `model` into its directory under `home`, then each repository that the model
 * loads besides its own into the Hugging Face cache, with the virtual environment's `hf`.
 */
export function planModelDownload(home: string, model: string): readonly Invocation[] {
  const hf = path.join(home, 'venv', 'bin', 'hf');
  const env = buildHuggingFaceEnv(home);
  const companions = COMPANION_REPOS.filter(({ pattern }) => pattern.test(model)).flatMap(({ repos }) => repos);
  return [
    { command: hf, args: ['download', model, '--local-dir', formatModelDir(home, model)], env },
    ...companions.map((repo) => ({ command: hf, args: ['download', repo], env })),
  ];
}

/**
 * The repositories that a model loads at startup besides its own, keyed by a pattern of model ids. The server runs
 * offline, so the model finds them only in the cache.
 */
const COMPANION_REPOS: readonly { pattern: RegExp; repos: readonly string[] }[] = [
  // mlx-audio's Higgs Audio v2 loads its codec from this repository rather than from the model's.
  { pattern: /higgs-audio-v2/i, repos: ['mlx-community/higgs-audio-v2-tokenizer'] },
];
