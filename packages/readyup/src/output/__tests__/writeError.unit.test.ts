import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { writeError } from '../writeError.ts';

describe(writeError, () => {
  it('prefixes the message with the program name', () => {
    using io = captureStdio();

    writeError('Kit not found');

    expect(io.stderr).toBe('rdy: Kit not found\n');
    expect(io.stdout).toBe('');
  });

  it('names the subject between the prefix and the message', () => {
    using io = captureStdio();

    writeError('No manifest.', 'packages/ui');

    expect(io.stderr).toBe('rdy: packages/ui: No manifest.\n');
  });
});
