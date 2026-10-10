import { execFileSync } from 'node:child_process';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { runCaptured } from '../test-utils/run-captured.ts';

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
});

// region | Helpers

/** Runs git in a directory. */
function git(dir: string, ...args: string[]): void {
  execFileSync('git', ['-C', dir, ...args]);
}

// endregion | Helpers
