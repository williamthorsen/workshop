import { describe, expect, it } from 'vitest';

import { captureOutput } from '../../test-utils/capture-output.ts';
import { CommandError, reportCommandErrorsAsync, warn } from '../errors.ts';

describe(CommandError, () => {
  it('exits 1 unless given a status', () => {
    expect(new CommandError('failed').exitCode).toBe(1);
    expect(new CommandError('missing', 127).exitCode).toBe(127);
  });
});

describe(reportCommandErrorsAsync, () => {
  it("resolves to the body's status when it does not throw", async () => {
    const captured = captureOutput();
    await expect(reportCommandErrorsAsync(captured.output, () => Promise.resolve(3))).resolves.toBe(3);
    expect(captured.stderr()).toBe('');
  });

  it("reports a rejected CommandError under the command's name and resolves to its status", async () => {
    const captured = captureOutput('tool');
    const status = await reportCommandErrorsAsync(captured.output, () =>
      Promise.reject(new CommandError('required command curl not found', 127)),
    );
    expect(status).toBe(127);
    expect(captured.stderr()).toBe('tool: required command curl not found\n');
  });

  it('rejects with any other error', async () => {
    const captured = captureOutput();
    await expect(reportCommandErrorsAsync(captured.output, () => Promise.reject(new TypeError('bug')))).rejects.toThrow(
      TypeError,
    );
  });
});

describe(warn, () => {
  it("writes the message on stderr under the command's name", () => {
    const captured = captureOutput('tool');
    warn(captured.output, 'nothing to do');
    expect(captured.stderr()).toBe('tool: nothing to do\n');
    expect(captured.stdout()).toBe('');
  });
});
