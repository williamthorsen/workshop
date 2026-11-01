import path from 'node:path';

/** Returns the directory under `home` that holds `model`, named for its Hugging Face ID with `/` replaced by `--`. */
export function formatModelDir(home: string, model: string): string {
  return path.join(home, 'models', model.replaceAll('/', '--'));
}
