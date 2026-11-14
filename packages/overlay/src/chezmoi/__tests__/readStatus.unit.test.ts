import { captureError } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { createFakeContext } from '../../test-utils/fake-runner.ts';
import { OverlayError } from '../../OverlayError.ts';
import { readStatus } from '../readStatus.ts';

describe(readStatus, () => {
  it('returns stdout when chezmoi status exits 0', async () => {
    const context = createFakeContext({ captured: { stdout: 'A  .newfile' } });

    await expect(readStatus(context)).resolves.toBe('A  .newfile');
    expect(context.runner.runCaptured).toHaveBeenCalledWith(context, ['status']);
  });

  it('throws with the stderr detail when chezmoi status exits non-zero', async () => {
    const context = createFakeContext({ captured: { stderr: 'source directory does not exist', code: 1 } });

    await expect(captureError(OverlayError, () => readStatus(context))).resolves.toHaveProperty(
      'message',
      expect.stringMatching(/chezmoi status failed: source directory does not exist/),
    );
  });

  it('falls back to the exit code when stderr is empty', async () => {
    const context = createFakeContext({ captured: { code: 1 } });

    await expect(captureError(OverlayError, () => readStatus(context))).resolves.toHaveProperty(
      'message',
      expect.stringMatching(/chezmoi status failed: exit code 1/),
    );
  });
});
