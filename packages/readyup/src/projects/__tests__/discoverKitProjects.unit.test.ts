import path from 'node:path';
import process from 'node:process';

import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockReaddirSync = vi.hoisted(() => vi.fn());

// Only directory reads are intercepted; the temporary-directory helper still writes through to disk.
vi.mock(import('node:fs'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, readdirSync: mockReaddirSync };
});

import { useTempDir } from '../../test-utils/tempDir.ts';
import { useFailingDirectoryRead } from '../../test-utils/useFailingDirectoryRead.ts';
import { discoverKitProjects } from '../discoverKitProjects.ts';

const tempDir = useTempDir({
  prefix: 'rdy-projects-',
  scope: 'file',
  setup: () => {
    // Sweep root: compiled kits and a manifest of its own.
    tempDir.writeJson('package.json', { name: 'root' });
    tempDir.write('.readyup/kits/demo.js', 'export default {};');
    tempDir.writeJson('.readyup/manifest.json', { version: 1, kits: [{ name: 'demo' }] });

    // Authored but never compiled, under the default source directory.
    tempDir.writeJson('packages/authored/package.json', { name: 'authored' });
    tempDir.write('packages/authored/.readyup/kits/default.ts', 'export default {};');

    // A config that cannot be evaluated, over a project that is a kit project regardless.
    tempDir.writeJson('packages/broken/package.json', { name: 'broken' });
    tempDir.write('packages/broken/.config/readyup.config.ts', 'export default { this is not TypeScript');
    tempDir.writeJson('packages/broken/.readyup/manifest.json', { version: 1, kits: [] });

    // Compiled with --skip-manifest: kits on disk, no manifest beside them.
    tempDir.writeJson('packages/compiled-only/package.json', { name: 'compiled-only' });
    tempDir.write('packages/compiled-only/.readyup/kits/thing.js', 'export default {};');

    // Authored but never compiled, under a source directory the config repoints.
    tempDir.writeJson('packages/custom/package.json', { name: 'custom' });
    tempDir.write('packages/custom/.config/readyup.config.ts', "export default { compile: { srcDir: 'src/kits' } };");
    tempDir.write('packages/custom/src/kits/lint.ts', 'export default {};');

    // Kits since deleted, manifest left behind.
    tempDir.writeJson('packages/emptied/package.json', { name: 'emptied' });
    tempDir.writeJson('packages/emptied/.readyup/manifest.json', { version: 1, kits: [{ name: 'gone' }] });

    // A workspace with no readyup footprint at all.
    tempDir.writeJson('packages/plain/package.json', { name: 'plain' });
    tempDir.write('packages/plain/src/index.ts', 'export {};');

    // Compiled to an output directory the config repoints.
    tempDir.writeJson('packages/tooling/package.json', { name: 'tooling' });
    tempDir.write(
      'packages/tooling/.config/readyup.config.ts',
      "export default { compile: { srcDir: 'kit-sources', outDir: 'dist/kits' } };",
    );
    tempDir.write('packages/tooling/dist/kits/lint.js', 'export default {};');

    // An installed dependency that publishes kits, which is not a project of this repo.
    tempDir.writeJson('node_modules/dep/package.json', { name: 'dep' });
    tempDir.write('node_modules/dep/.readyup/kits/dep.js', 'export default {};');
  },
});

const { failReadOf, passAllReads } = useFailingDirectoryRead(mockReaddirSync, () => tempDir.dir);

describe(discoverKitProjects, () => {
  beforeEach(() => {
    passAllReads();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports every kit project in the tree, the sweep root first', async () => {
    await expect(discoverDirs()).resolves.toStrictEqual([
      '.',
      'packages/authored',
      'packages/broken',
      'packages/compiled-only',
      'packages/custom',
      'packages/emptied',
      'packages/tooling',
    ]);
  });

  // A sweep has to reach this project to rewrite the manifest left behind.
  it('reports a project whose kits were deleted but whose manifest remains', async () => {
    await expect(discoverDirs()).resolves.toContain('packages/emptied');
  });

  it('reports a project with kit sources but no manifest and no compiled output', async () => {
    await expect(discoverDirs()).resolves.toContain('packages/authored');
  });

  it('reports a never-compiled project whose config repoints the source directory', async () => {
    await expect(discoverDirs()).resolves.toContain('packages/custom');
  });

  it('reports a project compiled without a manifest beside its kits', async () => {
    await expect(discoverDirs()).resolves.toContain('packages/compiled-only');
  });

  it('omits a workspace with neither a readyup directory nor a readyup config', async () => {
    await expect(discoverDirs()).resolves.not.toContain('packages/plain');
  });

  it('omits an installed dependency that publishes kits', async () => {
    await expect(discoverDirs()).resolves.not.toContain('node_modules/dep');
  });

  it('reads each project under its own config', async () => {
    const { projects } = await discover();
    const byDir = new Map(projects.map((project) => [project.dir, project]));

    expect(byDir.get('packages/custom')?.config.compile.srcDir).toBe('src/kits');
    expect(byDir.get('packages/tooling')?.config.compile.outDir).toBe('dist/kits');
    expect(byDir.get('.')?.config.compile.outDir).toBe('.readyup/kits');
  });

  it('resolves each project against the sweep root, manifest path included', async () => {
    const { projects } = await discover();
    const emptied = projects.find((project) => project.dir === 'packages/emptied');

    expect(emptied?.absolutePath).toBe(path.join(tempDir.dir, 'packages/emptied'));
    expect(emptied?.manifestPath).toBe(path.join(tempDir.dir, 'packages/emptied/.readyup/manifest.json'));
  });

  // Discovery is read-only, so a config nobody can evaluate costs that project its settings, not its place.
  it('reports a project whose config fails to evaluate, reading it with default settings', async () => {
    const { projects, stderr } = await discover();
    const broken = projects.find((project) => project.dir === 'packages/broken');

    expect(broken?.config.compile.srcDir).toBe('.readyup/kits');
    expect(stderr).toContain('packages/broken');
  });

  // Topology comes from the filesystem, so a repo declaring no workspaces is swept like any other.
  it('finds nested projects with no workspace file anywhere in the tree', async () => {
    await expect(discoverDirs()).resolves.toContain('packages/authored');
  });

  it('reports nothing for a tree holding no kit project', async () => {
    const { projects } = await discover(path.join(tempDir.dir, 'packages/plain'));

    expect(projects).toStrictEqual([]);
  });

  it('sweeps the working directory when no root is named', async () => {
    using _io = captureStdio();
    vi.spyOn(process, 'cwd').mockReturnValue(path.join(tempDir.dir, 'packages/emptied'));

    const projects = await discoverKitProjects();

    expect(projects.map((project) => project.dir)).toStrictEqual(['.']);
  });

  it.each(['EACCES', 'EPERM'])('omits a project whose kit directory it cannot read for a benign %s', async (code) => {
    failReadOf('packages/compiled-only/.readyup/kits', code);

    const { dirs, stderr } = await discover();

    expect(dirs).not.toContain('packages/compiled-only');
    expect(dirs).toStrictEqual(expect.arrayContaining(['.', 'packages/authored', 'packages/tooling']));
    expect(stderr).toContain('packages/compiled-only');
  });

  it('omits a project whose source directory it cannot read', async () => {
    failReadOf('packages/custom/src/kits', 'EACCES');

    const dirs = await discoverDirs();

    expect(dirs).not.toContain('packages/custom');
    expect(dirs).toContain('packages/authored');
  });

  it('rethrows a filesystem failure that is not benign', async () => {
    failReadOf('packages/compiled-only/.readyup/kits', 'EMFILE');

    await expect(discover()).rejects.toThrow('read failed: EMFILE');
  });
});

// region | Helpers

/** Sweeps the fixture tree for kit projects, returning them alongside what the sweep wrote to stderr. */
async function discover(root: string = tempDir.dir) {
  using io = captureStdio();

  const projects = await discoverKitProjects({ root });

  return { dirs: projects.map((project) => project.dir), projects, stderr: io.stderr };
}

/** Returns the root-relative directories discovery reports for the fixture tree. */
async function discoverDirs(): Promise<string[]> {
  const { dirs } = await discover();
  return dirs;
}

// endregion | Helpers
