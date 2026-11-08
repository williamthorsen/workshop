import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { writeWarnings } from '../writeWarnings.ts';

describe(writeWarnings, () => {
  it('writes one line per warning, in order, with the remedy after the message', () => {
    using io = captureStdio();

    writeWarnings([
      { code: 'source-stale', message: 'first is stale.', remedy: 'Recompile it.' },
      { code: 'target-drift', message: 'second drifted.', remedy: 'Move the edits.' },
    ]);

    expect(io.stderr).toBe('Warning: first is stale. Recompile it.\nWarning: second drifted. Move the edits.\n');
    expect(io.stdout).toBe('');
  });

  it('writes the message alone when the warning has no remedy', () => {
    using io = captureStdio();

    writeWarnings([{ code: 'future-code', message: 'something happened.' }]);

    expect(io.stderr).toBe('Warning: something happened.\n');
  });

  it('writes nothing for an empty list', () => {
    using io = captureStdio();

    writeWarnings([]);

    expect(io.stderr).toBe('');
  });
});
