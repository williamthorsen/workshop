import type { Stats } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
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
  findTimerPath: (name: string) => path.join(rootDir.path, 'units', `${name}.timer`),
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

  it('writes the unit readable by every user and writable only by its owner, whatever the umask', async () => {
    const previousUmask = process.umask(0);
    try {
      const unitPath = await installService(buildSpec());

      await expect(stat(unitPath)).resolves.toSatisfy((stats: Stats) => (stats.mode & 0o777) === 0o644);
    } finally {
      process.umask(previousUmask);
    }
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

  it('writes the oneshot unit and the timer, then stops the service and enables and restarts the timer', async () => {
    const unitPath = await installService(buildSpec({ trigger: { startIntervalSec: 86_400 } }));

    await expect(readFile(unitPath, 'utf8')).resolves.toContain('Type=oneshot\n');
    await expect(readFile(findTestTimerPath(), 'utf8')).resolves.toContain('OnUnitActiveSec=86400s\n');
    expect(vi.mocked(runSystemctl).mock.calls).toStrictEqual([
      [['daemon-reload']],
      [['stop', 'dev.example.service']],
      [['enable', 'dev.example.timer']],
      [['restart', 'dev.example.timer']],
    ]);
  });

  it('writes the timer readable by every user and writable only by its owner, whatever the umask', async () => {
    const previousUmask = process.umask(0);
    try {
      await installService(buildSpec({ trigger: { startIntervalSec: 60 } }));

      await expect(stat(findTestTimerPath())).resolves.toSatisfy((stats: Stats) => (stats.mode & 0o777) === 0o644);
    } finally {
      process.umask(previousUmask);
    }
  });

  it('disables an installed service before scheduling it, so that its boot link goes', async () => {
    await writeFile(findTestUnitPath(), '[Unit]\n');

    await installService(buildSpec({ trigger: { startIntervalSec: 60 } }));

    expect(vi.mocked(runSystemctl).mock.calls[0]).toStrictEqual([['disable', 'dev.example.service']]);
  });

  it('disables and removes the timer of a scheduled service that it keeps alive', async () => {
    await writeFile(findTestTimerPath(), '[Timer]\n');

    await installService(buildSpec());

    await expect(readdir(path.join(rootDir.path, 'units'))).resolves.toStrictEqual(['dev.example.service']);
    expect(vi.mocked(runSystemctl).mock.calls).toStrictEqual([
      [['disable', '--now', 'dev.example.timer']],
      [['daemon-reload']],
      [['enable', 'dev.example.service']],
      [['restart', 'dev.example.service']],
    ]);
  });

  it('rejects, writing nothing, when the timer fails to disable while it is still active', async () => {
    await writeFile(findTestTimerPath(), '[Timer]\n');
    vi.mocked(runSystemctl).mockResolvedValueOnce(buildSystemctlRun(1, 'Access denied\n'));

    await expect(installService(buildSpec())).rejects.toThrow(
      'systemctl disable failed while dev.example.timer is still active: Access denied',
    );
    await expect(readdir(path.join(rootDir.path, 'units'))).resolves.toStrictEqual(['dev.example.timer']);
  });

  it.each<[string, Partial<ServiceSpec>, string]>([
    ['an empty name', { name: '' }, 'Invalid service name'],
    ['a name with a separator', { name: 'dev/example' }, 'Invalid service name'],
    ['a template name', { name: 'dev@example' }, 'Invalid service name'],
    ['no program', { programArguments: [] }, 'Invalid program'],
    ['a relative program', { programArguments: ['bin/run.js'] }, 'Invalid program'],
    ['a relative log directory', { logDir: 'logs' }, 'Invalid log directory'],
    ['a dependency that is not a unit name', { after: ['docker service'] }, 'Invalid dependency'],
    ['an environment key with a hyphen', { environment: { 'MY-VAR': 'value' } }, 'Invalid environment variable'],
    ['an environment key with an equals sign', { environment: { 'A=B': 'value' } }, 'Invalid environment variable'],
    [
      'an environment key that starts with a digit',
      { environment: { '1KEY': 'value' } },
      'Invalid environment variable',
    ],
    ['a newline in an argument', { programArguments: ['/usr/bin/node', 'a\nb'] }, 'must not contain a line break'],
    [
      'a carriage return in an argument',
      { programArguments: ['/usr/bin/node', 'a\rb'] },
      'must not contain a line break',
    ],
    ['a NUL in the log directory', { logDir: '/var/log/a\0b' }, 'must not contain a line break'],
    ['a newline in an environment value', { environment: { KEY: 'a\nb' } }, 'must not contain a line break'],
    ['a zero interval', { trigger: { startIntervalSec: 0 } }, 'startIntervalSec must be a positive integer'],
    ['a negative interval', { trigger: { startIntervalSec: -60 } }, 'startIntervalSec must be a positive integer'],
    ['a fractional interval', { trigger: { startIntervalSec: 1.5 } }, 'startIntervalSec must be a positive integer'],
    [
      'an infinite interval',
      { trigger: { startIntervalSec: Infinity } },
      'startIntervalSec must be a positive integer',
    ],
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

/** Locates the timer under the temporary root. */
function findTestTimerPath(): string {
  return path.join(rootDir.path, 'units', 'dev.example.timer');
}

/** Locates the unit under the temporary root. */
function findTestUnitPath(): string {
  return path.join(rootDir.path, 'units', 'dev.example.service');
}

// endregion | Helpers
