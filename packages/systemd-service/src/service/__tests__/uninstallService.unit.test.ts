import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runSystemctl } from '../../systemctl/runSystemctl.ts';
import { buildSystemctlRun } from '../../test-utils/buildSystemctlRun.ts';
import { readServiceState } from '../readServiceState.ts';
import { uninstallService } from '../uninstallService.ts';

const { unitDir } = vi.hoisted(() => ({ unitDir: { path: '' } }));

vi.mock('../service-targets.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../service-targets.ts')>()),
  findTimerPath: (name: string) => path.join(unitDir.path, `${name}.timer`),
  findUnitPath: (name: string) => path.join(unitDir.path, `${name}.service`),
}));
vi.mock('../readServiceState.ts', () => ({ readServiceState: vi.fn() }));
vi.mock('../../systemctl/runSystemctl.ts', () => ({ runSystemctl: vi.fn() }));

describe(uninstallService, () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    unitDir.path = await mkdtemp(path.join(tmpdir(), 'systemd-service-'));
    await writeFile(findTestUnitPath(), '[Unit]\n');
    vi.mocked(readServiceState).mockResolvedValue({ lastExitCode: undefined, loaded: true, pid: 4_242 });
    vi.mocked(runSystemctl).mockResolvedValue(buildSystemctlRun(0));
  });

  afterEach(async () => {
    await rm(unitDir.path, { force: true, recursive: true });
  });

  it('stops and disables a loaded service, removes its unit, and reloads systemd', async () => {
    await expect(uninstallService('dev.example')).resolves.toStrictEqual({ wasLoaded: true });

    await expect(stat(findTestUnitPath())).rejects.toThrow('ENOENT');
    expect(vi.mocked(runSystemctl).mock.calls).toStrictEqual([
      [['disable', '--now', 'dev.example.service']],
      [['daemon-reload']],
      [['reset-failed', 'dev.example.service']],
    ]);
  });

  it('reports a service that systemd did not hold, and ignores the disable and reset that fail for it', async () => {
    await rm(findTestUnitPath());
    vi.mocked(readServiceState).mockResolvedValue({ loaded: false });
    vi.mocked(runSystemctl).mockImplementation(([subcommand]) =>
      Promise.resolve(buildSystemctlRun(subcommand === 'daemon-reload' ? 0 : 1)),
    );

    await expect(uninstallService('dev.example')).resolves.toStrictEqual({ wasLoaded: false });
  });

  it('rejects, keeping the unit, when the disable fails while the service is still active', async () => {
    vi.mocked(runSystemctl)
      .mockResolvedValueOnce(buildSystemctlRun(1, 'Access denied\n'))
      .mockResolvedValueOnce(buildSystemctlRun(0));

    await expect(uninstallService('dev.example')).rejects.toThrow(
      'systemctl disable failed while dev.example.service is still active: Access denied',
    );
    await expect(stat(findTestUnitPath())).resolves.toBeDefined();
  });

  it('stops, disables, and removes the timer before the service, and clears both failed states', async () => {
    await writeFile(findTestTimerPath(), '[Timer]\n');

    await expect(uninstallService('dev.example')).resolves.toStrictEqual({ wasLoaded: true });

    await expect(stat(findTestTimerPath())).rejects.toThrow('ENOENT');
    await expect(stat(findTestUnitPath())).rejects.toThrow('ENOENT');
    expect(vi.mocked(runSystemctl).mock.calls).toStrictEqual([
      [['disable', '--now', 'dev.example.timer']],
      [['disable', '--now', 'dev.example.service']],
      [['daemon-reload']],
      [['reset-failed', 'dev.example.service']],
      [['reset-failed', 'dev.example.timer']],
    ]);
  });

  it('rejects, keeping both units, when the timer fails to disable while it is still active', async () => {
    await writeFile(findTestTimerPath(), '[Timer]\n');
    vi.mocked(runSystemctl)
      .mockResolvedValueOnce(buildSystemctlRun(1, 'Access denied\n'))
      .mockResolvedValueOnce(buildSystemctlRun(0));

    await expect(uninstallService('dev.example')).rejects.toThrow(
      'systemctl disable failed while dev.example.timer is still active: Access denied',
    );
    await expect(stat(findTestTimerPath())).resolves.toBeDefined();
    await expect(stat(findTestUnitPath())).resolves.toBeDefined();
  });

  it('rejects with the output of a refused reload', async () => {
    vi.mocked(runSystemctl)
      .mockResolvedValueOnce(buildSystemctlRun(0))
      .mockResolvedValueOnce(buildSystemctlRun(1, 'Access denied\n'));

    await expect(uninstallService('dev.example')).rejects.toThrow('systemctl daemon-reload failed: Access denied');
  });
});

// region | Helpers

/** Locates the test service's timer in the temporary unit directory. */
function findTestTimerPath(): string {
  return path.join(unitDir.path, 'dev.example.timer');
}

/** Locates the test service's unit in the temporary unit directory. */
function findTestUnitPath(): string {
  return path.join(unitDir.path, 'dev.example.service');
}

// endregion | Helpers
