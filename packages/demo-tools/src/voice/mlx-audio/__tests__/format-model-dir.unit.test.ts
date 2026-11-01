import { describe, expect, it } from 'vitest';

import { formatModelDir } from '../format-model-dir.ts';

describe(formatModelDir, () => {
  it('names the directory for the model ID, replacing each / with --', () => {
    expect(formatModelDir('/voice', 'mlx-community/Qwen3-TTS')).toBe('/voice/models/mlx-community--Qwen3-TTS');
  });
});
