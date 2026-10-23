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

  it('rejects with the output of a refused reload', async () => {
    vi.mocked(runSystemctl)
      .mockResolvedValueOnce(buildSystemctlRun(0))
      .mockResolvedValueOnce(buildSystemctlRun(1, 'Access denied\n'));

    await expect(uninstallService('dev.example')).rejects.toThrow('systemctl daemon-reload failed: Access denied');
  });
});

// region | Helpers

/** Locates the test service's unit in the temporary unit directory. */
function findTestUnitPath(): string {
  return path.join(unitDir.path, 'dev.example.service');
}

// endregion | Helpers
