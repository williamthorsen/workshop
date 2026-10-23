import { describe, expect, it, vi } from 'vitest';

import { runSystemctl } from '../../systemctl/runSystemctl.ts';
import { buildSystemctlRun } from '../../test-utils/buildSystemctlRun.ts';
import { readServiceState } from '../readServiceState.ts';

vi.mock('../../systemctl/runSystemctl.ts', () => ({ runSystemctl: vi.fn() }));

describe(readServiceState, () => {
  it('reports an unknown service as not loaded', async () => {
    vi.mocked(runSystemctl).mockResolvedValue(buildShowRun({ LoadState: 'not-found', MainPID: '0' }));

    await expect(readServiceState('dev.example')).resolves.toStrictEqual({ loaded: false });
    expect(vi.mocked(runSystemctl).mock.calls[0]?.[0]).toContain('dev.example.service');
  });

  it('reports the pid of a running service that has not exited', async () => {
    vi.mocked(runSystemctl).mockResolvedValue(buildShowRun({ MainPID: '4242' }));

    await expect(readServiceState('dev.example')).resolves.toStrictEqual({
      lastExitCode: undefined,
      loaded: true,
      pid: 4_242,
    });
  });

  it('reports the exit code of a process that exited', async () => {
    vi.mocked(runSystemctl).mockResolvedValue(
      buildShowRun({ ExecMainCode: '1', ExecMainExitTimestampMonotonic: '91234', ExecMainStatus: '3' }),
    );

    await expect(readServiceState('dev.example')).resolves.toStrictEqual({
      lastExitCode: 3,
      loaded: true,
      pid: undefined,
    });
  });

  it.each([
    ['killed', '2'],
    ['dumped', '3'],
  ])('reports 128 plus the signal for a process that was %s', async (_description, code) => {
    vi.mocked(runSystemctl).mockResolvedValue(
      buildShowRun({ ExecMainCode: code, ExecMainExitTimestampMonotonic: '91234', ExecMainStatus: '9' }),
    );

    await expect(readServiceState('dev.example')).resolves.toMatchObject({ lastExitCode: 137 });
  });

  it('rejects with the output of a refused show', async () => {
    vi.mocked(runSystemctl).mockResolvedValue(buildSystemctlRun(1, 'Failed to connect to bus\n'));

    await expect(readServiceState('dev.example')).rejects.toThrow('systemctl show failed: Failed to connect to bus');
  });
});

// region | Helpers

/** Builds the output of `systemctl show` for a loaded service that has not exited, with the given overrides. */
function buildShowRun(overrides: Record<string, string>) {
  const properties = {
    ExecMainCode: '0',
    ExecMainExitTimestampMonotonic: '0',
    ExecMainStatus: '0',
    LoadState: 'loaded',
    MainPID: '0',
    ...overrides,
  };

  return buildSystemctlRun(
    0,
    Object.entries(properties)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(''),
  );
}

// endregion | Helpers
