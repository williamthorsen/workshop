import fs from 'node:fs';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { git, initWithCommit } from '../../test-utils/git-fixture.ts';
import { buildLargeListingTree } from '../../test-utils/large-listing.ts';
import { runCaptured } from '../test-utils/run-captured.ts';

const MOVE_REGISTRY = `repos:
  - name: app
    path: ~/repos/oss/app
    repo: owner/app
  - name: notes
    path: ~/repos/notes
`;

describe('REPO_COMMANDS with git', () => {
  it('detects a stack from tracked files alone, ignoring an untracked manifest', async () => {
    using home = createTempTree(
      {
        'repos/app/package.json': JSON.stringify({ dependencies: { react: '19' } }),
        'repos/app/supabase/config.toml': '',
        'repos/app/node_modules/next/package.json': JSON.stringify({ dependencies: { next: '15' } }),
        'repos/app/.gitignore': 'node_modules/\n',
        'registry/repos.yaml': 'repos:\n  - name: app\n    path: ~/repos/app\n',
      },
      { prefix: 'repo-tools-' },
    );
    const cloneDir = home.resolve('repos/app');
    git(cloneDir, 'init', '--quiet');
    git(cloneDir, 'add', '.');

    const result = await runCaptured(['scan', '--write', '--file', home.resolve('registry/repos.yaml')], {
      env: { HOME: home.dir },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('app: +react +supabase');
    expect(home.read('registry/repos.yaml')).toContain('stack: [react, supabase]');
  });

  it('detects the stack of a clone whose tracked-file listing exceeds 1 MiB', async () => {
    using home = createTempTree(
      {
        ...buildLargeListingTree('repos/big'),
        'repos/big/vercel.json': '{}',
        'registry/repos.yaml': 'repos:\n  - name: big\n    path: ~/repos/big\n',
      },
      { prefix: 'repo-tools-' },
    );
    const cloneDir = home.resolve('repos/big');
    git(cloneDir, 'init', '--quiet');
    git(cloneDir, 'add', '.');

    const result = await runCaptured(['scan', '--file', home.resolve('registry/repos.yaml')], {
      env: { HOME: home.dir },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('big: +vercel');
  });

  it('refuses --write to a registry reached through a link into a checkout on the live branch', async () => {
    const registryText = 'repos:\n  - name: app\n    path: ~/repos/app\n';
    using home = createTempTree({ 'deployed/repos.yaml': registryText }, { prefix: 'repo-tools-' });
    git(home.resolve('deployed'), 'init', '--quiet', '--initial-branch', 'live');
    home.symlink('.config/repos.yaml', home.resolve('deployed/repos.yaml'));

    const result = await runCaptured(['scan', '--write'], { env: { HOME: home.dir } });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--file <branch worktree copy>');
    expect(home.read('deployed/repos.yaml')).toBe(registryText);
  });

  it('registers a clone from its origin remote and tracked files', async () => {
    using home = createTempTree(
      { 'repos/delta/vercel.json': '{}', 'registry/repos.yaml': 'repos:\n' },
      { prefix: 'repo-tools-' },
    );
    const cloneDir = home.resolve('repos/delta');
    git(cloneDir, 'init', '--quiet');
    git(cloneDir, 'add', '.');
    git(cloneDir, 'remote', 'add', 'origin', 'git@github.com:owner/delta.git');

    const result = await runCaptured(['add', '.', '--write', '--file', home.resolve('registry/repos.yaml')], {
      cwd: cloneDir,
      env: { HOME: home.dir },
    });
    expect(result.status).toBe(0);
    expect(home.read('registry/repos.yaml')).toBe(
      'repos:\n  - name: delta\n    path: ~/repos/delta\n    repo: owner/delta\n    stack: [vercel]\n',
    );
  });

  it('registers the main worktree when run from a secondary worktree', async () => {
    using home = createTempTree(
      { 'repos/delta/vercel.json': '{}', 'registry/repos.yaml': 'repos:\n' },
      { prefix: 'repo-tools-' },
    );
    const cloneDir = home.resolve('repos/delta');
    git(cloneDir, 'init', '--quiet');
    git(cloneDir, 'add', '.');
    git(
      cloneDir,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '--quiet',
      '--no-gpg-sign',
      '--message',
      'Seed',
    );
    git(cloneDir, 'remote', 'add', 'origin', 'git@github.com:owner/delta.git');
    git(cloneDir, 'worktree', 'add', '--quiet', '-b', 'feature', home.resolve('repos/delta.feature'));

    const result = await runCaptured(['add', '.', '--file', home.resolve('registry/repos.yaml')], {
      cwd: home.resolve('repos/delta.feature'),
      env: { HOME: home.dir },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('path: ~/repos/delta\n');
  });

  describe('move', () => {
    it('moves a clone with its sibling worktree, rewrites the entry, and reports the remaining references', async () => {
      using home = createTempTree(
        {
          'repos/oss/app/README.md': '',
          'repos/notes/README.md': 'The app lives at ~/repos/oss/app.\n',
          'config/linked': '',
        },
        { prefix: 'repo-tools-' },
      );
      const homeDir = fs.realpathSync(home.dir);
      initWithCommit(`${homeDir}/repos/oss/app`);
      initWithCommit(`${homeDir}/repos/notes`);
      git(`${homeDir}/repos/oss/app`, 'worktree', 'add', '--quiet', '-b', 'live', `${homeDir}/repos/oss/app.live`);
      fs.rmSync(`${homeDir}/config/linked`);
      fs.symlinkSync(`${homeDir}/repos/oss/app.live/profile`, `${homeDir}/config/linked`);
      const registryFile = writeRegistry(homeDir, MOVE_REGISTRY);

      const result = await runCaptured(
        ['move', 'app', '~/repos/tools/kit', '--file', registryFile, '--search', '~/config'],
        { env: { HOME: homeDir } },
      );
      expect(result.stderr).toBe(
        'thor-repo: 2 remaining references to the old paths\n' +
          `thor-repo: moved app to ~/repos/tools/kit and updated ${registryFile}`,
      );
      expect(result.stdout).toBe(
        [
          '~/repos/oss/app -> ~/repos/tools/kit',
          '~/repos/oss/app.live -> ~/repos/tools/kit.live',
          'notes: README.md:1: The app lives at ~/repos/oss/app.',
          `~/config: linked -> ${homeDir}/repos/oss/app.live/profile`,
        ].join('\n'),
      );
      expect(result.status).toBe(0);
      for (const dir of ['repos/tools/kit', 'repos/tools/kit.live']) {
        expect(git(`${homeDir}/${dir}`, 'status', '--short')).toBe('');
      }
      expect(fs.readFileSync(registryFile, 'utf8')).toBe(
        MOVE_REGISTRY.replace(
          'path: ~/repos/oss/app\n',
          'path: ~/repos/tools/kit\n    formerPaths: [~/repos/oss/app]\n',
        ),
      );
    });

    it('changes nothing under --dry-run', async () => {
      using home = createTempTree(
        { 'repos/oss/app/README.md': '', 'repos/notes/README.md': '' },
        { prefix: 'repo-tools-' },
      );
      const homeDir = fs.realpathSync(home.dir);
      initWithCommit(`${homeDir}/repos/oss/app`);
      initWithCommit(`${homeDir}/repos/notes`);
      const registryFile = writeRegistry(homeDir, MOVE_REGISTRY);

      const result = await runCaptured(['move', 'app', '~/repos/tools/kit', '--dry-run', '--file', registryFile], {
        env: { HOME: homeDir },
      });
      expect(result.stdout).toBe('would move ~/repos/oss/app -> ~/repos/tools/kit');
      expect(result.stderr).toBe('thor-repo: nothing moved; run without --dry-run to move app');
      expect(result.status).toBe(0);
      expect(fs.existsSync(`${homeDir}/repos/oss/app`)).toBe(true);
      expect(fs.existsSync(`${homeDir}/repos/tools`)).toBe(false);
      expect(fs.readFileSync(registryFile, 'utf8')).toBe(MOVE_REGISTRY);
    });

    it('writes a registry inside the moved clone at its new location', async () => {
      using home = createTempTree({ 'repos/oss/app/repos.yaml': MOVE_REGISTRY }, { prefix: 'repo-tools-' });
      const homeDir = fs.realpathSync(home.dir);
      initWithCommit(`${homeDir}/repos/oss/app`);

      const result = await runCaptured(
        ['move', 'app', '~/repos/tools/kit', '--file', `${homeDir}/repos/oss/app/repos.yaml`],
        { env: { HOME: homeDir } },
      );
      expect(result.status).toBe(0);
      expect(fs.readFileSync(`${homeDir}/repos/tools/kit/repos.yaml`, 'utf8')).toContain(
        'path: ~/repos/tools/kit\n    formerPaths: [~/repos/oss/app]\n',
      );
    });
  });
});

// region | Helpers

/** Writes a registry outside every clone and returns its path. */
function writeRegistry(homeDir: string, text: string): string {
  fs.mkdirSync(`${homeDir}/registry`, { recursive: true });
  fs.writeFileSync(`${homeDir}/registry/repos.yaml`, text);
  return `${homeDir}/registry/repos.yaml`;
}

// endregion | Helpers
