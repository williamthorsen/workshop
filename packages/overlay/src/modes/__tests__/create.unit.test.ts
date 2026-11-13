import { describe, expect, it } from 'vitest';

import { createFakeContext } from '../../test-utils/fake-runner.ts';
import { runCreate } from '../create.ts';

describe(runCreate, () => {
  it('applies A and D entries by absolute target path', async () => {
    const context = createFakeContext({ captured: { stdout: ' A .new\n D .gone\n' } });

    const result = await runCreate(context);

    expect(context.runner.runStreamed).toHaveBeenCalledWith(
      context,
      ['apply', '--include=files,dirs,remove', '--', '/target/.new', '/target/.gone'],
      context.output,
    );
    expect(result.counts).toMatchObject({ created: 1, deleted: 1, conflicts: 0 });
    expect(result.exitCode).toBe(0);
  });

  it('reports a differing file as a conflict and never includes it in the apply call', async () => {
    const context = createFakeContext({ captured: { stdout: ' A .new\n M .diff\n' } });

    const result = await runCreate(context);

    expect(result.entries).toContainEqual({ path: '.diff', outcome: 'conflict' });
    expect(result.counts.conflicts).toBe(1);
    expect(result.exitCode).toBe(1);
    expect(context.runner.runStreamed).toHaveBeenCalledWith(
      context,
      expect.not.arrayContaining(['/target/.diff']),
      context.output,
    );
  });

  it('skips the targeted apply entirely when there are no A/D entries', async () => {
    const context = createFakeContext({ captured: { stdout: ' M .diff\n' } });

    const result = await runCreate(context);

    expect(context.runner.runStreamed).not.toHaveBeenCalled();
    expect(result.exitCode).toBe(1);
    expect(result.counts.conflicts).toBe(1);
  });

  it('runs a separate scripts pass when R rows are present', async () => {
    const context = createFakeContext({ captured: { stdout: ' A .new\n R normalize.sh\n' } });

    await runCreate(context);

    expect(context.runner.runStreamed).toHaveBeenCalledWith(
      context,
      ['apply', '--include=files,dirs,remove', '--', '/target/.new'],
      context.output,
    );
    expect(context.runner.runStreamed).toHaveBeenCalledWith(context, ['apply', '--include=scripts'], context.output);
  });

  it('does not run a scripts pass when no R rows are present', async () => {
    const context = createFakeContext({ captured: { stdout: ' A .new\n' } });

    await runCreate(context);

    expect(context.runner.runStreamed).toHaveBeenCalledTimes(1);
    expect(context.runner.runStreamed).toHaveBeenCalledWith(
      context,
      ['apply', '--include=files,dirs,remove', '--', '/target/.new'],
      context.output,
    );
  });

  it('maps a failing scripts pass to exit 2', async () => {
    const context = createFakeContext({ captured: { stdout: ' A .new\n R failing.sh\n' } });
    context.runner.runStreamed.mockImplementation((_dirs, args) =>
      Promise.resolve(args.includes('--include=scripts') ? 1 : 0),
    );

    const result = await runCreate(context);

    expect(result.exitCode).toBe(2);
    expect(result.scripts.ok).toBe(false);
  });

  it('maps a failing file-apply pass to exit 2 without masking it as drift', async () => {
    const context = createFakeContext({ captured: { stdout: ' A .new\n M .diff\n' }, streamedCode: 1 });

    const result = await runCreate(context);

    expect(result.exitCode).toBe(2);
    expect(result.scripts.ok).toBe(false);
  });

  it('short-circuits before the scripts pass when the file-apply fails', async () => {
    const context = createFakeContext({ captured: { stdout: ' A .new\n R normalize.sh\n' }, streamedCode: 1 });

    const result = await runCreate(context);

    expect(result.exitCode).toBe(2);
    // Only the file-apply ran; normalization scripts are never attempted against a half-written target.
    expect(context.runner.runStreamed).toHaveBeenCalledTimes(1);
    expect(context.runner.runStreamed).toHaveBeenCalledWith(
      context,
      ['apply', '--include=files,dirs,remove', '--', '/target/.new'],
      context.output,
    );
    expect(context.runner.runStreamed).not.toHaveBeenCalledWith(
      context,
      ['apply', '--include=scripts'],
      context.output,
    );
  });
});
