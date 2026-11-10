import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import type { JsonWarning } from '../../schemas/common.ts';
import { writeWarnings } from '../writeWarnings.ts';

describe(writeWarnings, () => {
  it('writes one line per warning, in order, with the remedy after the message', () => {
    using io = captureStdio();

    const warnings: JsonWarning[] = [
      { code: 'source-stale', message: 'first is stale.', remedy: 'Recompile it.' },
      { code: 'target-drift', message: 'second drifted.', remedy: 'Move the edits.' },
    ];

    writeWarnings(warnings);

    expect(io.stderr).toBe('Warning: first is stale. Recompile it.\nWarning: second drifted. Move the edits.\n');
    expect(io.stdout).toBe('');
  });

  it('writes the message alone when the warning has no remedy', () => {
    using io = captureStdio();

    writeWarnings([{ message: 'something happened.' }]);

    expect(io.stderr).toBe('Warning: something happened.\n');
  });

  it('writes nothing for an empty list', () => {
    using io = captureStdio();

    writeWarnings([]);

    expect(io.stderr).toBe('');
  });
});
