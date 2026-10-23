import type { Stats } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runSystemctl } from '../../systemctl/runSystemctl.ts';
import { buildSystemctlRun } from '../../test-utils/buildSystemctlRun.ts';
import type { ServiceSpec } from '../../unit/renderUnit.ts';
import { installService } from '../installService.ts';

const { rootDir } = vi.hoisted(() => ({ rootDir: { path: '' } }));

vi.mock('../service-targets.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../service-targets.ts')>()),
  findUnitPath: (name: string) => path.join(rootDir.path, 'units', `${name}.service`),
}));
vi.mock('../../systemctl/runSystemctl.ts', () => ({ runSystemctl: vi.fn() }));

describe(installService, () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    rootDir.path = await mkdtemp(path.join(tmpdir(), 'systemd-service-'));
    await mkdir(path.join(rootDir.path, 'units'));
    vi.mocked(runSystemctl).mockResolvedValue(buildSystemctlRun(0));
  });

  afterEach(async () => {
    await rm(rootDir.path, { force: true, recursive: true });
  });

  it('writes the unit, then reloads systemd, enables the service, and restarts it', async () => {
    const unitPath = await installService(buildSpec());

    expect(unitPath).toBe(path.join(rootDir.path, 'units/dev.example.service'));
    await expect(readFile(unitPath, 'utf8')).resolves.toContain('ExecStart="/usr/bin/node" "/srv/example/run.js"');
    expect(vi.mocked(runSystemctl).mock.calls).toStrictEqual([
      [['daemon-reload']],
      [['enable', 'dev.example.service']],
      [['restart', 'dev.example.service']],
    ]);
  });

  it('creates the log directory', async () => {
    const spec = buildSpec();

    await installService(spec);

    await expect(stat(spec.logDir)).resolves.toSatisfy((stats: Stats) => stats.isDirectory());
  });

  it('rejects with the output of a refused subcommand and runs none after it', async () => {
    vi.mocked(runSystemctl)
      .mockResolvedValueOnce(buildSystemctlRun(0))
      .mockResolvedValueOnce(buildSystemctlRun(1, 'Failed to enable unit: Access denied\n'));

    await expect(installService(buildSpec())).rejects.toThrow(
      'systemctl enable dev.example.service failed: Failed to enable unit: Access denied',
    );
    expect(runSystemctl).toHaveBeenCalledTimes(2);
  });

  it.each<[string, Partial<ServiceSpec>, string]>([
    ['an empty name', { name: '' }, 'Invalid service name'],
    ['a name with a separator', { name: 'dev/example' }, 'Invalid service name'],
    ['a template name', { name: 'dev@example' }, 'Invalid service name'],
    ['no program', { programArguments: [] }, 'Invalid program'],
    ['a relative program', { programArguments: ['bin/run.js'] }, 'Invalid program'],
    ['a relative log directory', { logDir: 'logs' }, 'Invalid log directory'],
    ['a dependency that is not a unit name', { after: ['docker service'] }, 'Invalid dependency'],
    ['a newline in an argument', { programArguments: ['/usr/bin/node', 'a\nb'] }, 'must not contain a newline'],
    ['a newline in an environment value', { environment: { KEY: 'a\nb' } }, 'must not contain a newline'],
  ])('rejects %s without writing or running anything', async (_description, overrides, message) => {
    await expect(installService(buildSpec(overrides))).rejects.toThrow(message);
    expect(runSystemctl).not.toHaveBeenCalled();
    await expect(readdir(path.join(rootDir.path, 'units'))).resolves.toStrictEqual([]);
  });
});

// region | Helpers

/** Builds a spec whose log directory lies under the temporary root. */
function buildSpec(overrides: Partial<ServiceSpec> = {}): ServiceSpec {
  return {
    logDir: path.join(rootDir.path, 'logs'),
    name: 'dev.example',
    programArguments: ['/usr/bin/node', '/srv/example/run.js'],
    ...overrides,
  };
}

// endregion | Helpers
