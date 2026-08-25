import { afterEach, describe, expect, it, vi } from 'vitest';

import * as runChezmoiModule from '../../chezmoi/runChezmoi.ts';
import { runCreate } from '../create.ts';
import { mockCapturedStatus, mockStreamedRun } from '../test-utils/chezmoi-mocks.ts';

const context = { source: '/src', target: '/target' };

describe(runCreate, () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('applies A and D entries by absolute target path', async () => {
    mockCapturedStatus(' A .new\n D .gone\n');
    const streamed = mockStreamedRun(0);

    const result = await runCreate(context);

    expect(streamed).toHaveBeenCalledWith(context, [
      'apply',
      '--include=files,dirs,remove',
      '--',
      '/target/.new',
      '/target/.gone',
    ]);
    expect(result.counts).toMatchObject({ created: 1, deleted: 1, conflicts: 0 });
    expect(result.exitCode).toBe(0);
  });

  it('reports a differing file as a conflict and never includes it in the apply call', async () => {
    mockCapturedStatus(' A .new\n M .diff\n');
    const streamed = mockStreamedRun(0);

    const result = await runCreate(context);

    expect(result.entries).toContainEqual({ path: '.diff', outcome: 'conflict' });
    expect(result.counts.conflicts).toBe(1);
    expect(result.exitCode).toBe(1);
    expect(streamed).toHaveBeenCalledWith(context, expect.not.arrayContaining(['/target/.diff']));
  });

  it('skips the targeted apply entirely when there are no A/D entries', async () => {
    mockCapturedStatus(' M .diff\n');
    const streamed = mockStreamedRun(0);

    const result = await runCreate(context);

    expect(streamed).not.toHaveBeenCalled();
    expect(result.exitCode).toBe(1);
    expect(result.counts.conflicts).toBe(1);
  });

  it('runs a separate scripts pass when R rows are present', async () => {
    mockCapturedStatus(' A .new\n R normalize.sh\n');
    const streamed = mockStreamedRun(0);

    await runCreate(context);

    expect(streamed).toHaveBeenCalledWith(context, ['apply', '--include=files,dirs,remove', '--', '/target/.new']);
    expect(streamed).toHaveBeenCalledWith(context, ['apply', '--include=scripts']);
  });

  it('does not run a scripts pass when no R rows are present', async () => {
    mockCapturedStatus(' A .new\n');
    const streamed = mockStreamedRun(0);

    await runCreate(context);

    expect(streamed).toHaveBeenCalledTimes(1);
    expect(streamed).toHaveBeenCalledWith(context, ['apply', '--include=files,dirs,remove', '--', '/target/.new']);
  });

  it('maps a failing scripts pass to exit 2', async () => {
    mockCapturedStatus(' A .new\n R failing.sh\n');
    vi.spyOn(runChezmoiModule, 'runChezmoiStreamed').mockImplementation((_context, args) =>
      Promise.resolve(args.includes('--include=scripts') ? 1 : 0),
    );

    const result = await runCreate(context);

    expect(result.exitCode).toBe(2);
    expect(result.scripts.ok).toBe(false);
  });

  it('maps a failing file-apply pass to exit 2 without masking it as drift', async () => {
    mockCapturedStatus(' A .new\n M .diff\n');
    mockStreamedRun(1);

    const result = await runCreate(context);

    expect(result.exitCode).toBe(2);
    expect(result.scripts.ok).toBe(false);
  });

  it('short-circuits before the scripts pass when the file-apply fails', async () => {
    mockCapturedStatus(' A .new\n R normalize.sh\n');
    const streamed = vi.spyOn(runChezmoiModule, 'runChezmoiStreamed').mockResolvedValue(1);

    const result = await runCreate(context);

    expect(result.exitCode).toBe(2);
    // Only the file-apply ran; normalization scripts are never attempted against a half-written target.
    expect(streamed).toHaveBeenCalledTimes(1);
    expect(streamed).toHaveBeenCalledWith(context, ['apply', '--include=files,dirs,remove', '--', '/target/.new']);
    expect(streamed).not.toHaveBeenCalledWith(context, ['apply', '--include=scripts']);
  });
});
