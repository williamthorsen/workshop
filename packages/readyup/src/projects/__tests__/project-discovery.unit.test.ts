import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { captureStdio, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, test, vi } from 'vitest';

const mockReaddirSync = vi.hoisted(() => vi.fn());

// Only directory reads are intercepted; the temporary tree still writes through to disk.
vi.mock(import('node:fs'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, readdirSync: mockReaddirSync };
});

import { useFailingDirectoryRead } from '../../test-utils/useFailingDirectoryRead.ts';
import { discoverKitProjects, discoverProjects } from '../project-discovery.ts';

const it = test
  .extend(
    'temp',
    { scope: 'file' },
    makeFixture(() =>
      createTempTree(
        {
          // Sweep root: compiled kits and a manifest of its own.
          'package.json': JSON.stringify({ name: 'root' }),
          '.readyup/kits/demo.js': 'export default {};',
          '.readyup/manifest.json': JSON.stringify({ version: 1, kits: [{ name: 'demo' }] }),

          // Authored but never compiled, under the default source directory.
          'packages/authored/package.json': JSON.stringify({ name: 'authored' }),
          'packages/authored/.readyup/kits/default.ts': 'export default {};',

          // A config that cannot be evaluated, over a project that is a kit project regardless.
          'packages/broken/package.json': JSON.stringify({ name: 'broken' }),
          'packages/broken/.config/readyup.config.ts': 'export default { this is not TypeScript',
          'packages/broken/.readyup/manifest.json': JSON.stringify({ version: 1, kits: [] }),

          // Compiled with --skip-manifest: kits on disk, no manifest beside them.
          'packages/compiled-only/package.json': JSON.stringify({ name: 'compiled-only' }),
          'packages/compiled-only/.readyup/kits/thing.js': 'export default {};',

          // Authored but never compiled, under a source directory the config repoints.
          'packages/custom/package.json': JSON.stringify({ name: 'custom' }),
          'packages/custom/.config/readyup.config.ts': "export default { compile: { srcDir: 'src/kits' } };",
          'packages/custom/src/kits/lint.ts': 'export default {};',

          // Kits since deleted, manifest left behind.
          'packages/emptied/package.json': JSON.stringify({ name: 'emptied' }),
          'packages/emptied/.readyup/manifest.json': JSON.stringify({ version: 1, kits: [{ name: 'gone' }] }),

          // A workspace with no readyup footprint at all.
          'packages/plain/package.json': JSON.stringify({ name: 'plain' }),
          'packages/plain/src/index.ts': 'export {};',

          // Compiled to an output directory the config repoints.
          'packages/tooling/package.json': JSON.stringify({ name: 'tooling' }),
          'packages/tooling/.config/readyup.config.ts':
            "export default { compile: { srcDir: 'kit-sources', outDir: 'dist/kits' } };",
          'packages/tooling/dist/kits/lint.js': 'export default {};',

          // An installed dependency that publishes kits, which is not a project of this repo.
          'node_modules/dep/package.json': JSON.stringify({ name: 'dep' }),
          'node_modules/dep/.readyup/kits/dep.js': 'export default {};',
        },
        { prefix: 'rdy-projects-' },
      ),
    ),
  )
  .extend('reads', { auto: true }, ({ temp }) => useFailingDirectoryRead(mockReaddirSync, temp.dir));

describe(discoverKitProjects, () => {
  it('reports every kit project in the tree, the sweep root first', async ({ temp }) => {
    await expect(discoverDirs(temp.dir)).resolves.toStrictEqual([
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
  it('reports a project whose kits were deleted but whose manifest remains', async ({ temp }) => {
    await expect(discoverDirs(temp.dir)).resolves.toContain('packages/emptied');
  });

  it('reports a project with kit sources but no manifest and no compiled output', async ({ temp }) => {
    await expect(discoverDirs(temp.dir)).resolves.toContain('packages/authored');
  });

  it('reports a never-compiled project whose config repoints the source directory', async ({ temp }) => {
    await expect(discoverDirs(temp.dir)).resolves.toContain('packages/custom');
  });

  it('reports a project compiled without a manifest beside its kits', async ({ temp }) => {
    await expect(discoverDirs(temp.dir)).resolves.toContain('packages/compiled-only');
  });

  it('omits a workspace with neither a readyup directory nor a readyup config', async ({ temp }) => {
    await expect(discoverDirs(temp.dir)).resolves.not.toContain('packages/plain');
  });

  it('omits an installed dependency that publishes kits', async ({ temp }) => {
    await expect(discoverDirs(temp.dir)).resolves.not.toContain('node_modules/dep');
  });

  it('reads each project under its own config', async ({ temp }) => {
    const { projects } = await discover(temp.dir);
    const byDir = new Map(projects.map((project) => [project.dir, project]));

    expect(byDir.get('packages/custom')?.config.compile.srcDir).toBe('src/kits');
    expect(byDir.get('packages/tooling')?.config.compile.outDir).toBe('dist/kits');
    expect(byDir.get('.')?.config.compile.outDir).toBe('.readyup/kits');
  });

  it('resolves each project against the sweep root, manifest path included', async ({ temp }) => {
    const { projects } = await discover(temp.dir);
    const emptied = projects.find((project) => project.dir === 'packages/emptied');

    expect(emptied?.absolutePath).toBe(temp.resolve('packages/emptied'));
    expect(emptied?.manifestPath).toBe(temp.resolve('packages/emptied/.readyup/manifest.json'));
  });

  // Discovery is read-only, so a config nobody can evaluate costs that project its settings, not its place.
  it('reports a project whose config fails to evaluate, reading it with default settings', async ({ temp }) => {
    const { projects, stderr } = await discover(temp.dir);
    const broken = projects.find((project) => project.dir === 'packages/broken');

    expect(broken?.config.compile.srcDir).toBe('.readyup/kits');
    expect(stderr).toContain('packages/broken');
  });

  // Topology comes from the filesystem, so a repo declaring no workspaces is swept like any other.
  it('finds nested projects with no workspace file anywhere in the tree', async ({ temp }) => {
    await expect(discoverDirs(temp.dir)).resolves.toContain('packages/authored');
  });

  it('reports no project for a tree holding none', async ({ temp }) => {
    const { projects } = await discover(temp.resolve('packages/plain'));

    expect(projects).toStrictEqual([]);
  });

  it('sweeps the working directory when no root is named', async ({ temp }) => {
    using _io = captureStdio();
    using _cwd = pointCwdAt(temp.resolve('packages/emptied'));

    const projects = await discoverKitProjects();

    expect(projects.map((project) => project.dir)).toStrictEqual(['.']);
  });

  it.for(['EACCES', 'EPERM'])(
    'omits a project whose kit directory it cannot read for a benign %s',
    async (code, { reads, temp }) => {
      reads.failReadOf('packages/compiled-only/.readyup/kits', code);

      const { dirs, stderr } = await discover(temp.dir);

      expect(dirs).not.toContain('packages/compiled-only');
      expect(dirs).toStrictEqual(expect.arrayContaining(['.', 'packages/authored', 'packages/tooling']));
      expect(stderr).toContain('packages/compiled-only');
    },
  );

  it('omits a project whose source directory it cannot read', async ({ reads, temp }) => {
    reads.failReadOf('packages/custom/src/kits', 'EACCES');

    const dirs = await discoverDirs(temp.dir);

    expect(dirs).not.toContain('packages/custom');
    expect(dirs).toContain('packages/authored');
  });

  it('rethrows a filesystem failure that is not benign', async ({ reads, temp }) => {
    reads.failReadOf('packages/compiled-only/.readyup/kits', 'EMFILE');

    await expect(discover(temp.dir)).rejects.toThrow('read failed: EMFILE');
  });
});

describe(discoverProjects, () => {
  it('reports every directory holding a package manifest, the sweep root first', async ({ temp }) => {
    await expect(discoverAllDirs(temp.dir)).resolves.toStrictEqual([
      '.',
      'packages/authored',
      'packages/broken',
      'packages/compiled-only',
      'packages/custom',
      'packages/emptied',
      'packages/plain',
      'packages/tooling',
    ]);
  });

  // The dependency axis asks what a workspace depends on, which one authoring no kits still answers.
  it('reports a workspace with neither a readyup directory nor a readyup config', async ({ temp }) => {
    await expect(discoverAllDirs(temp.dir)).resolves.toContain('packages/plain');
  });

  it('omits an installed dependency that publishes kits', async ({ temp }) => {
    await expect(discoverAllDirs(temp.dir)).resolves.not.toContain('node_modules/dep');
  });

  it('reads each project under its own config, defaulting the one declaring none', async ({ temp }) => {
    const { projects } = await discoverAll(temp.dir);
    const byDir = new Map(projects.map((project) => [project.dir, project]));

    expect(byDir.get('packages/tooling')?.config.compile.outDir).toBe('dist/kits');
    expect(byDir.get('packages/plain')?.config.compile.outDir).toBe('.readyup/kits');
  });

  it('sweeps the working directory when no root is named', async ({ temp }) => {
    using _io = captureStdio();
    using _cwd = pointCwdAt(temp.resolve('packages/plain'));

    const projects = await discoverProjects();

    expect(projects.map((project) => project.dir)).toStrictEqual(['.']);
  });
});

// region | Helpers

/** Sweeps the fixture tree for kit projects, returning them alongside what the sweep wrote to stderr. */
async function discover(root: string) {
  using io = captureStdio();

  const projects = await discoverKitProjects({ root });

  return { dirs: projects.map((project) => project.dir), projects, stderr: io.stderr };
}

/** Sweeps the fixture tree for every project, returning them alongside what the sweep wrote to stderr. */
async function discoverAll(root: string) {
  using io = captureStdio();

  const projects = await discoverProjects({ root });

  return { dirs: projects.map((project) => project.dir), projects, stderr: io.stderr };
}

/** Returns the root-relative directories the whole-tree sweep reports for the fixture tree. */
async function discoverAllDirs(root: string): Promise<string[]> {
  const { dirs } = await discoverAll(root);
  return dirs;
}

/** Returns the root-relative directories discovery reports for the fixture tree. */
async function discoverDirs(root: string): Promise<string[]> {
  const { dirs } = await discover(root);
  return dirs;
}

// endregion | Helpers
